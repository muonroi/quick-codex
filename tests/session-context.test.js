import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createProvisionalContext,
  forkSessionContext,
  promoteSessionContext,
  resolveSessionContext
} from "../lib/wrapper/session-context.js";
import { withPathLock, writeFileAtomic } from "../lib/wrapper/atomic-fs.js";

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-session-context-"));
}

function createFinalContextForAnotherOwner(dir, threadId) {
  return resolveSessionContext({
    dir,
    sessionId: threadId,
    createProvisional: true,
    env: { CODEX_THREAD_ID: "another-owner" }
  });
}

test("two thread IDs derive disjoint mutable roots", () => {
  const dir = makeProject();
  const a = resolveSessionContext({ dir, sessionId: "thread-a" });
  const b = resolveSessionContext({ dir, sessionId: "thread-b" });

  assert.notEqual(a.root, b.root);
  assert.match(a.statePath, /sessions\/thread-a\/STATE\.md$/);
  assert.equal(a.runsDir, path.join(a.root, "runs"));
  assert.equal(a.locksDir, path.join(a.root, "locks"));
  assert.equal(a.wrapperStatePath, path.join(a.root, "wrapper-state.json"));
  assert.equal(a.projectRoadmapPath, path.join(a.root, "PROJECT-ROADMAP.md"));
  assert.equal(a.backlogPath, path.join(a.root, "BACKLOG.md"));
  assert.equal(a.manifestPath, path.join(a.root, ".session.json"));
});

test("an unsafe identity cannot escape sessions", () => {
  const dir = makeProject();

  assert.throws(() => resolveSessionContext({ dir, sessionId: "../other" }), /unsafe session identity/i);
});

test("an explicit session ID takes precedence over an injected thread ID and records ownership", () => {
  const dir = makeProject();
  const context = resolveSessionContext({
    dir,
    sessionId: "selected-thread",
    createProvisional: true,
    env: { CODEX_THREAD_ID: "ambient-thread" }
  });

  const manifest = JSON.parse(fs.readFileSync(context.manifestPath, "utf8"));
  assert.equal(context.id, "selected-thread");
  assert.equal(context.kind, "session");
  assert.equal(manifest.id, "selected-thread");
  assert.equal(manifest.kind, "session");
  assert.equal(manifest.source, "explicit-session");
  assert.match(manifest.ownerNonce, /^[a-z0-9-]+$/i);
  assert.equal(manifest.parent, null);
});

test("a final namespace only resolves again with its bound owner nonce", () => {
  const dir = makeProject();
  const first = resolveSessionContext({ dir, sessionId: "thread-a" });

  assert.throws(
    () => resolveSessionContext({ dir, sessionId: "thread-a" }),
    /owned by another nonce/i
  );
  const rebound = resolveSessionContext({
    dir,
    sessionId: "thread-a",
    ownerNonce: first.ownerNonce
  });
  assert.equal(rebound.ownerNonce, first.ownerNonce);
});

test("a fork race cannot adopt an existing child namespace", () => {
  const dir = makeProject();
  forkSessionContext({ dir, parent: "thread-a", threadId: "thread-b" });

  assert.throws(
    () => forkSessionContext({ dir, parent: "thread-a", threadId: "thread-b" }),
    /owned by another nonce/i
  );
});

test("an explicit run and session must name the same owner", () => {
  const dir = makeProject();
  const context = resolveSessionContext({ dir, sessionId: "thread-a" });

  assert.throws(
    () => resolveSessionContext({
      dir,
      run: path.join(context.root, "runs", "feature.md"),
      sessionId: "thread-b"
    }),
    /--run and --session must agree/i
  );
});

test("an explicit run binds the stored owner nonce when its session agrees", () => {
  const dir = makeProject();
  const context = resolveSessionContext({ dir, sessionId: "thread-a" });
  const fromRun = resolveSessionContext({
    dir,
    run: path.join(context.root, "runs", "feature.md"),
    sessionId: "thread-a"
  });

  assert.equal(fromRun.ownerNonce, context.ownerNonce);
  assert.equal(fromRun.relativeRunPath, "runs/feature.md");
});

test("promotion refuses a final namespace owned by another nonce", () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  createFinalContextForAnotherOwner(dir, "thread-a");

  assert.throws(
    () => promoteSessionContext({ context: pending, threadId: "thread-a" }),
    /owned by another nonce/i
  );
  assert.equal(fs.existsSync(pending.root), true);
});

test("atomic writes retry a transient rename failure without leaving a temp file", () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const renameSync = fs.renameSync;
  let attempts = 0;
  fs.renameSync = (from, to) => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("temporarily busy");
      error.code = "EBUSY";
      throw error;
    }
    return renameSync(from, to);
  };

  try {
    writeFileAtomic(filePath, "fresh", { retries: 1 });
  } finally {
    fs.renameSync = renameSync;
  }

  assert.equal(fs.readFileSync(filePath, "utf8"), "fresh");
  assert.deepEqual(fs.readdirSync(dir), ["state.json"]);
});

test("path locks recover a lock whose recorded owner process is gone", async () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const lockPath = `${filePath}.lock`;
  fs.writeFileSync(lockPath, `${JSON.stringify({ pid: 999999999, nonce: "abandoned" })}\n`, "utf8");
  let entered = false;

  await withPathLock(filePath, async () => {
    entered = true;
  }, { retries: 0 });

  assert.equal(entered, true);
  assert.equal(fs.existsSync(lockPath), false);
});

test("path locks never reclaim a lock owned by a live process", async () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const lockPath = `${filePath}.lock`;
  fs.writeFileSync(lockPath, `${JSON.stringify({ pid: process.pid, nonce: "live" })}\n`, "utf8");

  await assert.rejects(
    withPathLock(filePath, async () => {}, { retries: 0 }),
    { code: "EEXIST" }
  );
  assert.equal(fs.existsSync(lockPath), true);
});

test("path locks wait while another process holds the abandoned-lock recovery claim", async () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const recoveryPath = `${filePath}.lock.recovery`;
  fs.writeFileSync(recoveryPath, `${JSON.stringify({ pid: process.pid, nonce: "live-recovery" })}\n`, "utf8");

  await assert.rejects(
    withPathLock(filePath, async () => {}, { retries: 0 }),
    { code: "EEXIST" }
  );
  assert.equal(fs.existsSync(recoveryPath), true);
});

test("path locks reclaim an abandoned recovery claim", async () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const recoveryPath = `${filePath}.lock.recovery`;
  fs.writeFileSync(recoveryPath, `${JSON.stringify({ pid: 999999999, nonce: "dead-recovery" })}\n`, "utf8");
  let entered = false;

  await withPathLock(filePath, async () => {
    entered = true;
  }, { retries: 0 });

  assert.equal(entered, true);
  assert.equal(fs.existsSync(recoveryPath), false);
});

test("path locks reclaim an aged recovery claim abandoned before metadata publication", async () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const recoveryPath = `${filePath}.lock.recovery`;
  fs.writeFileSync(recoveryPath, "", "utf8");
  const staleTime = new Date(Date.now() - 2_000);
  fs.utimesSync(recoveryPath, staleTime, staleTime);
  let entered = false;

  await withPathLock(filePath, async () => {
    entered = true;
  }, { retries: 0 });

  assert.equal(entered, true);
  assert.equal(fs.existsSync(recoveryPath), false);
});

test("path locks preserve a fresh recovery claim until metadata publication grace expires", async () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const recoveryPath = `${filePath}.lock.recovery`;
  fs.writeFileSync(recoveryPath, "", "utf8");

  await assert.rejects(
    withPathLock(filePath, async () => {}, { retries: 0 }),
    { code: "EEXIST" }
  );
  assert.equal(fs.existsSync(recoveryPath), true);
});

test("recovery cleanup cannot race an unpublished claim into a live claim before deletion", async () => {
  const dir = makeProject();
  const filePath = path.join(dir, "state.json");
  const lockPath = `${filePath}.lock`;
  const recoveryPath = `${lockPath}.recovery`;
  fs.writeFileSync(lockPath, `${JSON.stringify({ pid: 999999999, nonce: "abandoned" })}\n`, "utf8");

  const [{ withPathLock: publishWithPathLock }, { withPathLock: cleanWithPathLock }] = await Promise.all([
    import("../lib/wrapper/atomic-fs.js?publication-owner"),
    import("../lib/wrapper/atomic-fs.js?publication-cleaner")
  ]);
  const open = fs.promises.open;
  const link = fs.promises.link;
  const unlink = fs.promises.unlink;
  let pausePublication;
  const publicationPaused = new Promise((resolve) => {
    pausePublication = resolve;
  });
  let resumePublication;
  const publicationMayContinue = new Promise((resolve) => {
    resumePublication = resolve;
  });
  let markPublicationAttempted;
  const publicationAttempted = new Promise((resolve) => {
    markPublicationAttempted = resolve;
  });
  let publicationIsPaused = false;
  let cleanupInterleaved = false;
  let cleanupObservedLiveMetadata = false;
  let cleanerEntered = false;

  fs.promises.open = async (target, flags, ...args) => {
    const handle = await open(target, flags, ...args);
    if (target === recoveryPath && flags === "wx" && !publicationIsPaused) {
      publicationIsPaused = true;
      const writeFile = handle.writeFile.bind(handle);
      handle.writeFile = async (...writeArgs) => {
        pausePublication();
        await publicationMayContinue;
        try {
          return await writeFile(...writeArgs);
        } finally {
          markPublicationAttempted();
        }
      };
    }
    return handle;
  };
  fs.promises.link = async (source, target) => {
    if (target === recoveryPath && !publicationIsPaused) {
      publicationIsPaused = true;
      pausePublication();
      await publicationMayContinue;
      try {
        return await link(source, target);
      } finally {
        markPublicationAttempted();
      }
    }
    return link(source, target);
  };
  fs.promises.unlink = async (target, ...args) => {
    if (target === recoveryPath && !cleanupInterleaved) {
      cleanupInterleaved = true;
      resumePublication();
      await publicationAttempted;
      try {
        const metadata = JSON.parse(fs.readFileSync(recoveryPath, "utf8"));
        cleanupObservedLiveMetadata = metadata.pid === process.pid && typeof metadata.nonce === "string";
      } catch {
        // A malformed claim is still safe to reclaim.
      }
    }
    return unlink(target, ...args);
  };

  try {
    const publisher = publishWithPathLock(filePath, async () => {}, { retries: 0 });
    await publicationPaused;
    if (!fs.existsSync(recoveryPath)) {
      fs.writeFileSync(recoveryPath, "", "utf8");
    }
    const staleTime = new Date(Date.now() - 2_000);
    fs.utimesSync(recoveryPath, staleTime, staleTime);

    const cleaner = cleanWithPathLock(filePath, async () => {
      cleanerEntered = true;
    }, { retries: 0 });
    await Promise.allSettled([publisher, cleaner]);
  } finally {
    resumePublication();
    fs.promises.open = open;
    fs.promises.link = link;
    fs.promises.unlink = unlink;
  }

  assert.equal(cleanupObservedLiveMetadata, false);
  assert.equal(cleanerEntered, true);
});
