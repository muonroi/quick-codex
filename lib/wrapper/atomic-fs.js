import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const transientCodes = new Set(["EBUSY", "EPERM"]);
const pathQueues = new Map();

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

async function acquireCrossProcessLock(lockPath, { retries = 40, retryDelayMs = 25 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fs.promises.open(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt === retries) {
        throw error;
      }
      await sleep(retryDelayMs);
    }
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
