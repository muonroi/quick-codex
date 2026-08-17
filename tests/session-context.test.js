import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createProvisionalContext,
  promoteSessionContext,
  resolveSessionContext
} from "../lib/wrapper/session-context.js";
import { writeFileAtomic } from "../lib/wrapper/atomic-fs.js";

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
