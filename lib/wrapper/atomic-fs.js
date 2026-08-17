import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const transientCodes = new Set(["EBUSY", "EPERM"]);
const pathQueues = new Map();
const RECOVERY_PUBLICATION_GRACE_MS = 1_000;

function retrySync(operation, { retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!transientCodes.has(error?.code) || attempt === retries) {
        throw error;
      }
    }
  }
  throw lastError;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function tempPathFor(filePath) {
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
}

function quarantinePathFor(filePath) {
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.quarantine`);
}

export function writeFileAtomic(filePath, content, options = {}) {
  const directory = path.dirname(filePath);
  const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), options.encoding ?? "utf8");

  fs.mkdirSync(directory, { recursive: true });
  retrySync(() => {
    const temporaryPath = tempPathFor(filePath);
    try {
      const descriptor = fs.openSync(temporaryPath, "wx", options.mode);
      try {
        fs.writeFileSync(descriptor, data);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporaryPath, filePath);
      try {
        const directoryDescriptor = fs.openSync(directory, "r");
        try {
          fs.fsyncSync(directoryDescriptor);
        } finally {
          fs.closeSync(directoryDescriptor);
        }
      } catch (error) {
        if (error?.code !== "EINVAL" && error?.code !== "EPERM") {
          throw error;
        }
      }
    } catch (error) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") {
          throw cleanupError;
        }
      }
      throw error;
    }
  }, options);
}

export function createFileExclusive(filePath, content = "", options = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return retrySync(() => {
    const descriptor = fs.openSync(filePath, "wx", options.mode);
    try {
      fs.writeFileSync(descriptor, content, options.encoding ?? "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    return filePath;
  }, options);
}

function lockMetadata() {
  return `${JSON.stringify({ pid: process.pid, nonce: randomUUID(), createdAt: new Date().toISOString() })}\n`;
}

function ownerProcessIsGone(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

async function publishRecoveryClaim(recoveryPath) {
  const stagingPath = tempPathFor(recoveryPath);
  let stagingLock;
  let published = false;
  try {
    stagingLock = await fs.promises.open(stagingPath, "wx");
    try {
      await stagingLock.writeFile(lockMetadata(), "utf8");
      await stagingLock.sync();
    } finally {
      await stagingLock.close();
      stagingLock = null;
    }
    await fs.promises.link(stagingPath, recoveryPath);
    published = true;
    await fs.promises.unlink(stagingPath);
    return { recoveryPath };
  } catch (error) {
    await stagingLock?.close().catch(() => undefined);
    if (published) {
      await fs.promises.unlink(recoveryPath).catch(() => undefined);
    }
    await fs.promises.unlink(stagingPath).catch(() => undefined);
    throw error;
  }
}

async function restoreQuarantinedRecoveryClaim(recoveryPath, quarantinePath) {
  try {
    await fs.promises.link(quarantinePath, recoveryPath);
  } catch (error) {
    if (error?.code === "EEXIST" || error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
  await fs.promises.unlink(quarantinePath).catch((error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  });
  return true;
}

async function reclaimAbandonedRecoveryClaim(recoveryPath) {
  const quarantinePath = quarantinePathFor(recoveryPath);
  try {
    await fs.promises.rename(recoveryPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  let claimText;
  let claimStat;
  try {
    [claimText, claimStat] = await Promise.all([
      fs.promises.readFile(quarantinePath, "utf8"),
      fs.promises.stat(quarantinePath)
    ]);
  } catch (error) {
    await restoreQuarantinedRecoveryClaim(recoveryPath, quarantinePath);
    if (error?.code !== "ENOENT") {
      throw error;
    }
    return false;
  }
  let metadata;
  try {
    metadata = JSON.parse(claimText);
  } catch {
    // Current claimants publish fully written metadata with one exclusive link,
    // so a malformed canonical claim is legacy/crash residue, not a live owner.
    if ((Date.now() - claimStat.mtimeMs) < RECOVERY_PUBLICATION_GRACE_MS) {
      await restoreQuarantinedRecoveryClaim(recoveryPath, quarantinePath);
      return false;
    }
    await fs.promises.unlink(quarantinePath).catch((error) => {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    });
    return true;
  }
  if (!ownerProcessIsGone(metadata?.pid)) {
    await restoreQuarantinedRecoveryClaim(recoveryPath, quarantinePath);
    return false;
  }
  await fs.promises.unlink(quarantinePath).catch((error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  });
  return true;
}

async function recoverAbandonedLock(lockPath) {
  const recoveryPath = `${lockPath}.recovery`;
  let recoveryClaim;
  try {
    recoveryClaim = await publishRecoveryClaim(recoveryPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      return null;
    }
    throw error;
  }

  let recovered = false;
  try {
    const metadata = JSON.parse(await fs.promises.readFile(lockPath, "utf8"));
    if (!ownerProcessIsGone(metadata?.pid)) {
      return null;
    }
    await fs.promises.unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    });
    recovered = true;
    return recoveryClaim;
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === "ENOENT") {
      return null;
    }
    throw error;
  } finally {
    if (!recovered) {
      await releaseRecoveryClaim(recoveryClaim);
    }
  }
}

async function releaseRecoveryClaim(claim) {
  if (!claim) {
    return false;
  }
  await fs.promises.unlink(claim.recoveryPath).catch((error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  });
}

async function acquireCrossProcessLock(lockPath, { retries = 40, retryDelayMs = 25 } = {}) {
  const recoveryPath = `${lockPath}.recovery`;
  let recoveryClaim = null;
  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (!recoveryClaim && fs.existsSync(recoveryPath)) {
        if (await reclaimAbandonedRecoveryClaim(recoveryPath)) {
          attempt -= 1;
          continue;
        }
        if (attempt === retries) {
          const error = new Error(`Recovery is in progress for ${lockPath}`);
          error.code = "EEXIST";
          throw error;
        }
        await sleep(retryDelayMs);
        continue;
      }

      try {
        const lock = await fs.promises.open(lockPath, "wx");
        try {
          await lock.writeFile(lockMetadata(), "utf8");
          await lock.sync();
        } catch (error) {
          await lock.close();
          await fs.promises.unlink(lockPath).catch(() => undefined);
          throw error;
        }
        await releaseRecoveryClaim(recoveryClaim);
        recoveryClaim = null;
        return lock;
      } catch (error) {
        if (error?.code !== "EEXIST") {
          throw error;
        }
        if (!recoveryClaim) {
          recoveryClaim = await recoverAbandonedLock(lockPath);
          if (recoveryClaim) {
            attempt -= 1;
            continue;
          }
        }
        if (attempt === retries) {
          throw error;
        }
        await sleep(retryDelayMs);
      }
    }
  } finally {
    await releaseRecoveryClaim(recoveryClaim);
  }
  throw new Error(`Could not acquire path lock for ${lockPath}`);
}

export function withPathLock(filePath, operation, options = {}) {
  const canonicalPath = path.resolve(filePath);
  const previous = pathQueues.get(canonicalPath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const lockPath = `${canonicalPath}.lock`;
    await fs.promises.mkdir(path.dirname(canonicalPath), { recursive: true });
    const lock = await acquireCrossProcessLock(lockPath, options);
    try {
      return await operation();
    } finally {
      await lock.close();
      await fs.promises.unlink(lockPath).catch((error) => {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      });
    }
  });
  pathQueues.set(canonicalPath, next);
  return next.finally(() => {
    if (pathQueues.get(canonicalPath) === next) {
      pathQueues.delete(canonicalPath);
    }
  });
}
