import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

import {
  createProvisionalContext,
  resolveSessionContext
} from "../lib/wrapper/session-context.js";
import {
  finalizeAdapterSessionContext,
  runCodexCommand
} from "../lib/wrapper/codex-cli.js";
import { CodexAppServerSession } from "../lib/wrapper/app-server-client.js";
import {
  launchNativeCodexSession,
  NativeRemoteSession,
  NativeSessionController,
  NativeSessionObserver,
  promoteObservedNativeContext
} from "../lib/wrapper/native-session.js";

const policy = {
  permissionProfile: "safe",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  bypassApprovalsAndSandbox: false
};

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-wrapper-promotion-"));
}

function makeFakeExecBin(dir, status = 0) {
  const filePath = path.join(dir, `fake-codex-${status}.sh`);
  fs.writeFileSync(filePath, `#!/bin/sh\nexit ${status}\n`, "utf8");
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

function decision(overrides = {}) {
  return {
    prompt: "test prompt",
    mode: "fresh-session",
    nativeThreadAction: null,
    resumableThreadId: null,
    policy,
    ...overrides
  };
}

function withEnv(values, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function snapshotTree(root) {
  const snapshot = {};
  function visit(current, relative = "") {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute, nextRelative);
      else snapshot[nextRelative] = fs.readFileSync(absolute).toString("hex");
    }
  }
  if (fs.existsSync(root)) visit(root);
  return snapshot;
}

test("exec promotes only after the child closes and then re-reads from the final owner", async () => {
  const dir = makeProject();
  const context = createProvisionalContext({ dir });
  const events = [];
  const fakeBin = makeFakeExecBin(dir);

  const result = await withEnv({
    QUICK_CODEX_WRAP_CODEX_BIN: fakeBin,
    QUICK_CODEX_WRAP_FAKE_SESSION_ID: "thread-a"
  }, () => runCodexCommand({
    dir,
    decision: decision(),
    context,
    onLifecycleEvent: (event) => events.push(event),
    reloadAfterPromotion(finalContext) {
      events.push("reload");
      return { owner: finalContext.id };
    }
  }));

  assert.equal(events.indexOf("child-close") < events.indexOf("promote"), true);
  assert.equal(events.indexOf("promote") < events.indexOf("reload"), true);
  assert.equal(result.context.id, "thread-a");
  assert.deepEqual(result.reloaded, { owner: "thread-a" });
  assert.equal(fs.existsSync(context.root), false);
});

test("exec promotes a non-zero result when the child still exposes a final id", async () => {
  const dir = makeProject();
  const context = createProvisionalContext({ dir });
  const fakeBin = makeFakeExecBin(dir, 7);

  const result = await withEnv({
    QUICK_CODEX_WRAP_CODEX_BIN: fakeBin,
    QUICK_CODEX_WRAP_FAKE_SESSION_ID: "thread-failed"
  }, () => runCodexCommand({
    dir,
    decision: decision(),
    context
  }));

  assert.equal(result.status, 7);
  assert.equal(result.context.id, "thread-failed");
});

test("exec without a final id preserves and marks the pending namespace", async () => {
  const dir = makeProject();
  const context = createProvisionalContext({ dir });
  const fakeBin = makeFakeExecBin(dir);

  const result = await withEnv({
    QUICK_CODEX_WRAP_CODEX_BIN: fakeBin,
    QUICK_CODEX_WRAP_FAKE_SESSION_ID: null
  }, () => runCodexCommand({
    dir,
    decision: decision(),
    context
  }));

  const manifest = JSON.parse(fs.readFileSync(context.manifestPath, "utf8"));
  assert.equal(result.context.id, context.id);
  assert.equal(result.context.kind, "provisional");
  assert.equal(manifest.recovery.reason, "missing-final-id");
});

class FakeAppServerSession extends CodexAppServerSession {
  constructor(events) {
    super({ dir: ".", policy });
    this.events = events;
    this.notifications = [];
    this.stderr = "";
  }

  async start(_model, _policy, _reasoningEffort, context = null) {
    this.initialized = true;
    this.currentContextId = context?.id ?? null;
    this.events.push(`start:${context?.id ?? "none"}`);
  }

  async send(method) {
    this.events.push(method);
    if (method === "thread/start") return { thread: { id: "thread-app" } };
    if (method === "turn/start") {
      queueMicrotask(() => {
        this.events.push("turn-completed");
        this.currentOperation.turnCompleted.resolve({ turn: { id: "turn-1" } });
      });
      return { turn: { id: "turn-1" } };
    }
    return {};
  }
}

class FakeFallbackAppServerSession extends FakeAppServerSession {
  async send(method, params = null) {
    this.events.push(method);
    if (method === "thread/resume" && params?.threadId === "thread-source") {
      throw new Error("thread/resume space limit exceeded");
    }
    if (method === "thread/resume") return { thread: { id: params?.threadId } };
    if (method === "thread/start") return { thread: { id: "thread-fallback" } };
    if (method === "turn/start") {
      queueMicrotask(() => this.currentOperation.turnCompleted.resolve({ turn: { id: "turn-fallback" } }));
      return { turn: { id: "turn-fallback" } };
    }
    return {};
  }
}

class FakeMissingIdAppServerSession extends FakeAppServerSession {
  async send(method) {
    this.events.push(method);
    if (method === "thread/start") return { thread: {} };
    if (method === "turn/start") throw new Error("turn/start must not be reached");
    return {};
  }
}

test("app-server promotes before turn/start", async () => {
  const dir = makeProject();
  const context = createProvisionalContext({ dir });
  const events = [];
  const session = new FakeAppServerSession(events);

  const result = await session.runDecision({
    dir,
    decision: decision({ nativeThreadAction: "thread/start" }),
    policy,
    context,
    onLifecycleEvent: (event) => events.push(event),
    reloadAfterPromotion: () => events.push("reload")
  });

  assert.equal(events.indexOf("promote") < events.indexOf("turn/start"), true);
  assert.notEqual(events.indexOf("start:thread-app"), -1);
  assert.equal(events.indexOf("start:thread-app") < events.indexOf("turn/start"), true);
  assert.equal(events.indexOf("turn-completed") < events.indexOf("reload"), true);
  assert.equal(result.context.id, "thread-app");
});

test("fresh app-server continuation forks source bytes and records parent", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({ dir, sessionId: "thread-source" });
  fs.mkdirSync(source.runsDir, { recursive: true });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  fs.writeFileSync(path.join(source.runsDir, "work.md"), "source-run", "utf8");
  const pending = createProvisionalContext({ dir, parent: source });
  const events = [];
  const session = new FakeAppServerSession(events);

  const result = await session.runDecision({
    dir,
    decision: decision({ nativeThreadAction: "thread/start" }),
    policy,
    context: pending,
    sourceContext: source
  });

  const manifest = JSON.parse(fs.readFileSync(result.context.manifestPath, "utf8"));
  assert.equal(manifest.parent, "thread-source");
  assert.equal(fs.readFileSync(result.context.statePath, "utf8"), "source-state");
  assert.equal(fs.readFileSync(path.join(result.context.runsDir, "work.md"), "utf8"), "source-run");
  assert.equal(fs.readFileSync(source.statePath, "utf8"), "source-state");
});

test("fresh app-server start from a final owner copies the source snapshot exactly once", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({ dir, sessionId: "thread-source" });
  fs.mkdirSync(source.runsDir, { recursive: true });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  fs.writeFileSync(source.wrapperStatePath, "source-wrapper", "utf8");
  fs.writeFileSync(path.join(source.runsDir, "work.md"), "source-run", "utf8");
  const sourceBefore = snapshotTree(source.root);
  const session = new FakeAppServerSession([]);

  const result = await session.runDecision({
    dir,
    decision: decision({ nativeThreadAction: "thread/start" }),
    policy,
    context: source
  });

  const manifest = JSON.parse(fs.readFileSync(result.context.manifestPath, "utf8"));
  assert.equal(manifest.parent, source.id);
  assert.equal(manifest.forkSnapshot.sourceId, source.id);
  assert.equal(fs.readFileSync(result.context.statePath, "utf8"), "source-state");
  assert.equal(fs.readFileSync(result.context.wrapperStatePath, "utf8"), "source-wrapper");
  assert.equal(fs.readFileSync(path.join(result.context.runsDir, "work.md"), "utf8"), "source-run");
  assert.deepEqual(snapshotTree(source.root), sourceBefore);
});

for (const nativeThreadAction of ["thread/resume", "thread/compact/start"]) {
  test(`${nativeThreadAction} fallback forks into the new thread before turn/start`, async () => {
    const dir = makeProject();
    const source = resolveSessionContext({ dir, sessionId: "thread-source" });
    fs.writeFileSync(source.statePath, "source-state", "utf8");
    const events = [];
    const session = new FakeFallbackAppServerSession(events);

    const result = await session.runDecision({
      dir,
      decision: decision({ nativeThreadAction, resumableThreadId: source.id }),
      policy,
      context: source,
      sourceContext: source,
      onLifecycleEvent: (event) => events.push(event)
    });

    assert.equal(events.indexOf("promote") < events.indexOf("turn/start"), true);
    assert.equal(result.context.id, "thread-fallback");
    assert.equal(result.nativeThreadActionEffective, "thread/start");
    assert.equal(JSON.parse(fs.readFileSync(result.context.manifestPath, "utf8")).parent, source.id);
    assert.equal(fs.readFileSync(result.context.statePath, "utf8"), "source-state");
  });
}

test("app-server missing a final thread id fails before turn/start and marks recovery", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({ dir, sessionId: "thread-source" });
  const events = [];
  const session = new FakeMissingIdAppServerSession(events);

  await assert.rejects(
    session.runDecision({
      dir,
      decision: decision({ nativeThreadAction: "thread/start" }),
      policy,
      context: source,
      sourceContext: source
    }),
    /thread id/i
  );

  assert.equal(events.includes("turn/start"), false);
  const sessionsRoot = path.dirname(source.root);
  const pendingNames = fs.readdirSync(sessionsRoot).filter((name) => name.startsWith("pending-"));
  assert.equal(pendingNames.length, 1);
  const manifest = JSON.parse(fs.readFileSync(path.join(sessionsRoot, pendingNames[0], ".session.json"), "utf8"));
  assert.equal(manifest.parent, source.id);
  assert.equal(manifest.recovery.reason, "missing-final-id");
  assert.equal(JSON.parse(fs.readFileSync(source.manifestPath, "utf8")).recovery, undefined);
});

test("a destination collision fails closed and preserves both namespaces", () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const occupied = resolveSessionContext({ dir, sessionId: "thread-occupied" });

  assert.throws(
    () => finalizeAdapterSessionContext({ context: pending, threadId: occupied.id }),
    /owned by another nonce/i
  );
  assert.equal(fs.existsSync(pending.root), true);
  assert.equal(fs.existsSync(occupied.root), true);
});

test("reverse-order provisional completion keeps final owners isolated", async () => {
  const dir = makeProject();
  const first = createProvisionalContext({ dir });
  const second = createProvisionalContext({ dir });
  fs.writeFileSync(first.statePath, "first", "utf8");
  fs.writeFileSync(second.statePath, "second", "utf8");

  const finalSecond = finalizeAdapterSessionContext({ context: second, threadId: "thread-second" });
  const finalFirst = finalizeAdapterSessionContext({ context: first, threadId: "thread-first" });

  assert.equal(fs.readFileSync(finalFirst.statePath, "utf8"), "first");
  assert.equal(fs.readFileSync(finalSecond.statePath, "utf8"), "second");
});

test("rename failure marks the pending namespace as recoverable", () => {
  const dir = makeProject();
  const source = resolveSessionContext({ dir, sessionId: "thread-source" });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  const pending = createProvisionalContext({ dir, parent: source });
  const originalRename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (from === pending.root) {
      const error = new Error("rename unavailable");
      error.code = "EBUSY";
      throw error;
    }
    return originalRename(from, to);
  };
  try {
    assert.throws(
      () => finalizeAdapterSessionContext({ context: pending, threadId: "thread-rename", sourceContext: source }),
      /rename unavailable/i
    );
  } finally {
    fs.renameSync = originalRename;
  }

  const manifest = JSON.parse(fs.readFileSync(pending.manifestPath, "utf8"));
  assert.equal(manifest.recovery.reason, "promotion-failed");
  assert.equal(manifest.recovery.threadId, "thread-rename");

  const recovered = finalizeAdapterSessionContext({
    context: pending,
    threadId: "thread-rename",
    sourceContext: source
  });
  assert.equal(fs.readFileSync(recovered.statePath, "utf8"), "source-state");
  assert.equal(JSON.parse(fs.readFileSync(recovered.manifestPath, "utf8")).recovery, undefined);
});

test("promotion recovers idempotently after rename succeeded before manifest refresh", () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const targetRoot = path.join(path.dirname(pending.root), "thread-recovered");
  fs.renameSync(pending.root, targetRoot);

  const promoted = finalizeAdapterSessionContext({
    context: pending,
    threadId: "thread-recovered"
  });

  const manifest = JSON.parse(fs.readFileSync(promoted.manifestPath, "utf8"));
  assert.equal(promoted.id, "thread-recovered");
  assert.equal(manifest.id, "thread-recovered");
  assert.equal(manifest.kind, "session");
  assert.equal(manifest.ownerNonce, pending.ownerNonce);
});

test("native context waits for an observed trusted id", () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });

  assert.equal(promoteObservedNativeContext({ context: pending, observedThreadId: null }).id, pending.id);
  const promoted = promoteObservedNativeContext({ context: pending, observedThreadId: "thread-native" });
  assert.equal(promoted.id, "thread-native");
});

test("native first task submits under the provisional owner and promotes after trusted turn settlement", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const observer = new NativeSessionObserver();
  const events = [];
  const stdin = {
    destroyed: false,
    write(value) {
      events.push(`write:${value}`);
      assert.equal(fs.existsSync(pending.root), true);
      queueMicrotask(() => {
        events.push("busy");
        observer.record("native-busy", { text: "working" });
        setImmediate(() => {
          events.push("settled");
          observer.record("turn-settled", { sessionId: "thread-native-first", text: "session id: thread-native-first" });
        });
      });
    }
  };
  const session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({ stdin, mode: "pipe" });
  observer.record("prompt-ready", { text: ">" });

  const submitted = await session.task("do work", { timeoutMs: 1000 });

  assert.equal(submitted.startedBy, "native-busy");
  assert.equal(submitted.ownerPromotedBy, "turn-settled");
  assert.equal(events[0], "write:do work\n");
  assert.deepEqual(events.slice(1), ["busy", "settled"]);
  assert.equal(session.ownerContext.id, "thread-native-first");
  assert.equal(fs.existsSync(pending.root), false);
});

test("run dry-run leaves both an empty project and an existing source namespace byte-unchanged", () => {
  const wrapperPath = path.resolve("bin/quick-codex-wrap.js");
  const runDry = (dir, extraArgs = []) => {
    const env = {
      ...process.env,
      QUICK_CODEX_NO_UPDATE_CHECK: "1",
      QUICK_CODEX_WRAP_DISABLE_TASK_ROUTER: "1",
      QUICK_CODEX_WRAP_DISABLE_MODEL_ROUTER: "1"
    };
    delete env.CODEX_THREAD_ID;
    delete env.CODEX_SESSION_ID;
    return spawnSync(process.execPath, [
      wrapperPath,
      "run",
      "--task", "inspect only",
      "--dry-run",
      "--json",
      "--dir", dir,
      ...extraArgs
    ], { cwd: path.dirname(wrapperPath), env, encoding: "utf8" });
  };

  const emptyDir = makeProject();
  const emptyResult = runDry(emptyDir);
  assert.equal(emptyResult.status, 0, emptyResult.stderr);
  assert.deepEqual(snapshotTree(emptyDir), {});

  const sourceDir = makeProject();
  const source = resolveSessionContext({ dir: sourceDir, sessionId: "thread-source" });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  const sourceBefore = snapshotTree(sourceDir);
  const sourceResult = runDry(sourceDir, ["--session", source.id]);
  assert.equal(sourceResult.status, 0, sourceResult.stderr);
  assert.deepEqual(snapshotTree(sourceDir), sourceBefore);
});

test("standalone native launch cannot auto-submit a prompt from a provisional owner", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });

  await assert.rejects(
    launchNativeCodexSession({ dir, context: pending, prompt: "do work", dryRun: true }),
    /NativeRemoteSession/i
  );
});
