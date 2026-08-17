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
import { baseRun } from "./test-helpers.js";

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

class FakeMissingFallbackAppServerSession extends FakeAppServerSession {
  constructor(events, dir) {
    super(events);
    this.dir = dir;
    this.pendingAtFreshStart = [];
  }

  async send(method, params = null) {
    this.events.push(method);
    if (method === "thread/resume") {
      throw new Error("thread/resume space limit exceeded");
    }
    if (method === "thread/start") {
      const sessionsRoot = path.join(this.dir, ".quick-codex-flow", "sessions");
      this.pendingAtFreshStart = fs.readdirSync(sessionsRoot).filter((name) => name.startsWith("pending-"));
      return { thread: {} };
    }
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

for (const nativeThreadAction of ["thread/resume", "thread/compact/start"]) {
  test(`${nativeThreadAction} missing-id fallback creates and marks a provisional child before fresh start`, async () => {
    const dir = makeProject();
    const source = resolveSessionContext({ dir, sessionId: "thread-source" });
    const sourceBefore = snapshotTree(source.root);
    const events = [];
    const session = new FakeMissingFallbackAppServerSession(events, dir);

    await assert.rejects(
      session.runDecision({
        dir,
        decision: decision({ nativeThreadAction, resumableThreadId: source.id }),
        policy,
        context: source,
        sourceContext: source
      }),
      /thread id/i
    );

    assert.equal(events.includes("turn/start"), false);
    assert.equal(session.pendingAtFreshStart.length, 1);
    const pendingRoot = path.join(path.dirname(source.root), session.pendingAtFreshStart[0]);
    const manifest = JSON.parse(fs.readFileSync(path.join(pendingRoot, ".session.json"), "utf8"));
    assert.equal(manifest.parent, source.id);
    assert.equal(manifest.recovery.reason, "missing-final-id");
    assert.deepEqual(snapshotTree(source.root), sourceBefore);
  });
}

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

test("native first task establishes a trusted owner with /status before user work", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const observer = new NativeSessionObserver();
  const threadId = "11111111-1111-4111-8111-111111111111";
  const events = [];
  let session;
  const stdin = {
    destroyed: false,
    write(value) {
      if (value === "/status\n") {
        events.push(`status:${session.ownerContext.kind}`);
        queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${threadId}\n›`));
        return;
      }
      events.push(`task:${session.ownerContext.kind}:${session.ownerContext.id}:${value}`);
      fs.writeFileSync(session.ownerContext.statePath, "in-turn-final-write", "utf8");
      queueMicrotask(() => observer.record("native-busy", { text: "working" }));
    }
  };
  session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({ stdin, mode: "pipe" });
  observer.record("prompt-ready", { text: ">" });

  const submitted = await session.task("do work", { timeoutMs: 1000 });

  assert.equal(submitted.startedBy, "native-busy");
  assert.deepEqual(events, [
    "status:provisional",
    `task:session:${threadId}:do work\n`
  ]);
  assert.equal(session.ownerContext.id, threadId);
  assert.equal(fs.readFileSync(session.ownerContext.statePath, "utf8"), "in-turn-final-write");
  assert.equal(fs.existsSync(pending.root), false);
});

test("native continuation resumes and verifies an existing final owner before user work", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({
    dir,
    sessionId: "12121212-1212-4121-8121-121212121212"
  });
  const observer = new NativeSessionObserver();
  const writes = [];
  let session;
  session = new NativeRemoteSession({ dir, context: source, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${source.id}\n›`));
          return;
        }
        queueMicrotask(() => observer.record("native-busy", { text: "working" }));
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await session.task("continue work", { timeoutMs: 1000 });

  assert.deepEqual(writes, ["/status\n", "continue work\n"]);
  assert.equal(session.ownerContext.id, source.id);
});

test("native explicit final owner mismatch fails closed before user work", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({
    dir,
    sessionId: "13131313-1313-4131-8131-131313131313"
  });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  const sourceBefore = snapshotTree(source.root);
  const actualId = "14141414-1414-4141-8141-141414141414";
  const observer = new NativeSessionObserver();
  const writes = [];
  const session = new NativeRemoteSession({ dir, context: source, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${actualId}\n›`));
        }
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await assert.rejects(
    session.task("must not run", { timeoutMs: 1000 }),
    /does not match.*owner|owner.*does not match/i
  );

  assert.deepEqual(writes, ["/status\n"]);
  assert.deepEqual(snapshotTree(source.root), sourceBefore);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "sessions", actualId)), false);
});

test("native /status proof accumulates a label and UUID split across output chunks", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const threadId = "15151515-1515-4151-8151-151515151515";
  const observer = new NativeSessionObserver();
  const writes = [];
  const session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", "Session "));
          queueMicrotask(() => observer.ingestChunk("stdout", "ID: 15151515-1515-"));
          queueMicrotask(() => observer.ingestChunk("stdout", "4151-8151-151515151515\n›"));
          return;
        }
        queueMicrotask(() => observer.record("native-busy", { text: "working" }));
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await session.task("split proof", { timeoutMs: 1000 });

  assert.deepEqual(writes, ["/status\n", "split proof\n"]);
  assert.equal(session.ownerContext.id, threadId);
});

test("native /status proof ignores a stale post-injection turn-settled event", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const staleId = "25252525-2525-4252-8252-252525252525";
  const actualId = "26262626-2626-4262-8262-262626262626";
  const observer = new NativeSessionObserver();
  const writes = [];
  let resolveActualStatus;
  const actualStatusRendered = new Promise((resolve) => {
    resolveActualStatus = resolve;
  });
  const session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n") {
          queueMicrotask(() => observer.record("turn-settled", {
            text: `codex resume ${staleId}`,
            sessionId: staleId
          }));
          setTimeout(() => {
            observer.ingestChunk("stdout", `Session ID: ${actualId}\n›`);
            resolveActualStatus();
          }, 10);
          return;
        }
        queueMicrotask(() => observer.record("native-busy", { text: "working" }));
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await session.task("use actual owner", { timeoutMs: 1000 });
  await actualStatusRendered;

  assert.deepEqual(writes, ["/status\n", "use actual owner\n"]);
  assert.equal(session.ownerContext.id, actualId);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "sessions", staleId)), false);
});

test("native /status proof waits for a prompt newer than its identity output", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const threadId = "27272727-2727-4272-8272-272727272727";
  const observer = new NativeSessionObserver();
  const timeline = [];
  let resolveFreshPrompt;
  const freshPromptRendered = new Promise((resolve) => {
    resolveFreshPrompt = resolve;
  });
  const session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        if (value === "/status\n") {
          queueMicrotask(() => {
            timeline.push("identity");
            observer.ingestChunk("stdout", `Session ID: ${threadId}\n`);
          });
          setTimeout(() => {
            timeline.push("fresh-prompt");
            observer.record("prompt-ready", { text: ">" });
            resolveFreshPrompt();
          }, 20);
          return;
        }
        timeline.push("task");
        queueMicrotask(() => observer.record("native-busy", { text: "working" }));
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await session.task("wait for clean prompt", { timeoutMs: 1000 });
  await freshPromptRendered;

  assert.deepEqual(timeline, ["identity", "fresh-prompt", "task"]);
  assert.equal(session.ownerContext.id, threadId);
});

test("native /status proof never completes a stale pre-injection identity", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const observer = new NativeSessionObserver();
  const writes = [];
  observer.ingestChunk("stdout", "Session ID: 16161616-1616-");
  const session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", "4161-8161-161616161616\n›"));
        }
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await assert.rejects(
    session.task("must not run", { timeoutMs: 20 }),
    /status.*thread id|thread id.*status/i
  );

  assert.deepEqual(writes, ["/status\n"]);
  assert.equal(session.ownerContext.kind, "provisional");
});

test("native /resume verifies and rebinds the resumed owner before subsequent work", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({
    dir,
    sessionId: "17171717-1717-4171-8171-171717171717"
  });
  const target = resolveSessionContext({
    dir,
    sessionId: "18181818-1818-4181-8181-181818181818"
  });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  fs.writeFileSync(target.statePath, "target-state", "utf8");
  const sourceBefore = snapshotTree(source.root);
  const targetBefore = snapshotTree(target.root);
  const observer = new NativeSessionObserver();
  const writes = [];
  let activeId = source.id;
  const session = new NativeRemoteSession({ dir, context: source, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${activeId}\n›`));
          return;
        }
        if (value === `/resume ${target.id}\n`) {
          activeId = target.id;
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${activeId}`));
          setTimeout(() => observer.record("prompt-ready", { text: ">" }), 5);
          return;
        }
        queueMicrotask(() => observer.record("native-busy", { text: "working" }));
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await session.slash(`/resume ${target.id}`, { timeoutMs: 1000 });
  await session.task("resumed work", { timeoutMs: 1000 });

  assert.deepEqual(writes, [
    "/status\n",
    `/resume ${target.id}\n`,
    "/status\n",
    "resumed work\n"
  ]);
  assert.equal(session.ownerContext.id, target.id);
  assert.deepEqual(snapshotTree(source.root), sourceBefore);
  assert.deepEqual(snapshotTree(target.root), targetBefore);
});

test("native dry-run command resumes an existing final owner explicitly", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({
    dir,
    sessionId: "19191919-1919-4191-8191-191919191919"
  });

  const result = await launchNativeCodexSession({ dir, context: source, dryRun: true });

  const resumeIndex = result.command.indexOf("resume");
  assert.notEqual(resumeIndex, -1);
  assert.equal(result.command[resumeIndex + 1], source.id);
});

test("standalone native launch cannot auto-submit a prompt before final-owner status proof", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({
    dir,
    sessionId: "20202020-2020-4202-8202-202020202020"
  });

  await assert.rejects(
    launchNativeCodexSession({ dir, context: source, prompt: "unsafe work", dryRun: true }),
    /NativeRemoteSession.*status|status.*NativeRemoteSession/i
  );
});

test("native first task missing /status identity marks recovery and never submits user work", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });
  const observer = new NativeSessionObserver();
  const writes = [];
  const stdin = {
    destroyed: false,
    write(value) {
      writes.push(value);
      queueMicrotask(() => observer.record("prompt-ready", { text: ">" }));
    }
  };
  const session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({ stdin, mode: "pipe" });
  observer.record("prompt-ready", { text: ">" });

  await assert.rejects(
    session.task("do work", { timeoutMs: 20 }),
    /status.*thread id|thread id.*status/i
  );

  assert.deepEqual(writes, ["/status\n"]);
  const manifest = JSON.parse(fs.readFileSync(pending.manifestPath, "utf8"));
  assert.equal(manifest.recovery.reason, "missing-final-id");
});

test("native /status owner collision fails before user work and preserves both owners", async () => {
  const dir = makeProject();
  const occupied = resolveSessionContext({ dir, sessionId: "22222222-2222-4222-8222-222222222222" });
  const occupiedBefore = snapshotTree(occupied.root);
  const pending = createProvisionalContext({ dir });
  const observer = new NativeSessionObserver();
  const writes = [];
  const session = new NativeRemoteSession({ dir, context: pending, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${occupied.id}\n›`));
        }
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await assert.rejects(session.task("do work"), /owned by another nonce/i);

  assert.deepEqual(writes, ["/status\n"]);
  assert.equal(fs.existsSync(pending.root), true);
  assert.deepEqual(snapshotTree(occupied.root), occupiedBefore);
  assert.equal(JSON.parse(fs.readFileSync(pending.manifestPath, "utf8")).recovery.reason, "promotion-failed");
});

test("native /clear forks into a newly established owner before subsequent work", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({ dir, sessionId: "33333333-3333-4333-8333-333333333333" });
  fs.mkdirSync(source.runsDir, { recursive: true });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  fs.writeFileSync(source.wrapperStatePath, "source-wrapper", "utf8");
  fs.writeFileSync(path.join(source.runsDir, "work.md"), "source-run", "utf8");
  const sourceBefore = snapshotTree(source.root);
  const nextThreadId = "44444444-4444-4444-8444-444444444444";
  const observer = new NativeSessionObserver();
  const writes = [];
  let pendingRoot = null;
  let session;
  session = new NativeRemoteSession({ dir, context: source, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(`${session.ownerContext.kind}:${session.ownerContext.id}:${value}`);
        if (value === "/status\n" && session.ownerContext.kind === "session") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${source.id}\n›`));
          return;
        }
        if (value === "/clear\n") {
          pendingRoot = session.ownerContext.root;
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${nextThreadId}`));
          setTimeout(() => {
            writes.push("clear-ready");
            observer.record("prompt-ready", { text: ">" });
          }, 5);
          return;
        }
        if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Chat ID: ${nextThreadId}\n›`));
          return;
        }
        fs.writeFileSync(session.ownerContext.statePath, "new-owner-work", "utf8");
        queueMicrotask(() => observer.record("native-busy", { text: "working" }));
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await session.slash("/clear", { timeoutMs: 1000 });
  await session.task("continue work", { timeoutMs: 1000 });

  assert.equal(writes[0], `session:${source.id}:/status\n`);
  assert.match(writes[1], /^provisional:pending-.*:\/clear\n$/);
  assert.equal(writes[2], "clear-ready");
  assert.match(writes[3], /^provisional:pending-.*:\/status\n$/);
  assert.equal(writes[4], `session:${nextThreadId}:continue work\n`);
  assert.equal(session.ownerContext.id, nextThreadId);
  assert.equal(fs.existsSync(pendingRoot), false);
  const manifest = JSON.parse(fs.readFileSync(session.ownerContext.manifestPath, "utf8"));
  assert.equal(manifest.parent, source.id);
  assert.equal(manifest.forkSnapshot.sourceId, source.id);
  assert.equal(fs.readFileSync(session.ownerContext.wrapperStatePath, "utf8"), "source-wrapper");
  assert.equal(fs.readFileSync(path.join(session.ownerContext.runsDir, "work.md"), "utf8"), "source-run");
  assert.equal(fs.readFileSync(session.ownerContext.statePath, "utf8"), "new-owner-work");
  assert.deepEqual(snapshotTree(source.root), sourceBefore);
});

test("native /clear collision keeps the source and occupied owner unchanged", async () => {
  const dir = makeProject();
  const source = resolveSessionContext({ dir, sessionId: "55555555-5555-4555-8555-555555555555" });
  fs.writeFileSync(source.statePath, "source-state", "utf8");
  const occupied = resolveSessionContext({ dir, sessionId: "66666666-6666-4666-8666-666666666666" });
  fs.writeFileSync(occupied.statePath, "occupied-state", "utf8");
  const sourceBefore = snapshotTree(source.root);
  const occupiedBefore = snapshotTree(occupied.root);
  const observer = new NativeSessionObserver();
  const writes = [];
  let session;
  session = new NativeRemoteSession({ dir, context: source, observer });
  session.started = true;
  session.controller = new NativeSessionController({
    mode: "pipe",
    stdin: {
      destroyed: false,
      write(value) {
        writes.push(value);
        if (value === "/status\n" && session.ownerContext.kind === "session") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${source.id}\n›`));
        } else if (value === "/clear\n") {
          queueMicrotask(() => observer.record("prompt-ready", { text: ">" }));
        } else if (value === "/status\n") {
          queueMicrotask(() => observer.ingestChunk("stdout", `Session ID: ${occupied.id}\n›`));
        }
      }
    }
  });
  observer.record("prompt-ready", { text: ">" });

  await assert.rejects(session.slash("/clear", { timeoutMs: 1000 }), /owned by another nonce/i);

  assert.deepEqual(writes, ["/status\n", "/clear\n", "/status\n"]);
  assert.equal(session.ownerContext.kind, "provisional");
  const recovery = JSON.parse(fs.readFileSync(session.ownerContext.manifestPath, "utf8"));
  assert.equal(recovery.parent, source.id);
  assert.equal(recovery.recovery.reason, "promotion-failed");
  assert.deepEqual(snapshotTree(source.root), sourceBefore);
  assert.deepEqual(snapshotTree(occupied.root), occupiedBefore);
});

test("dry-run command matrix leaves state and output paths byte-unchanged", async (t) => {
  const wrapperPath = path.resolve("bin/quick-codex-wrap.js");
  const runDry = (dir, commandArgs) => {
    const outputPath = path.join(dir, "output", "last-message.txt");
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
      ...commandArgs,
      "--dry-run",
      "--json",
      "--dir", dir,
      "--output-last-message", outputPath
    ], { cwd: path.dirname(wrapperPath), env, encoding: "utf8" });
  };

  for (const commandArgs of [
    ["run", "--task", "inspect only"],
    ["auto", "--task", "inspect only"]
  ]) {
    await t.test(commandArgs[0], () => {
      const dir = makeProject();
      const result = runDry(dir, commandArgs);
      assert.equal(result.status, 0, `${commandArgs[0]}: ${result.stderr}`);
      assert.deepEqual(snapshotTree(dir), {}, commandArgs[0]);
      assert.equal(fs.existsSync(path.join(dir, "output")), false, commandArgs[0]);
    });
  }

  for (const command of ["start", "continue"]) {
    await t.test(command, () => {
      const dir = makeProject();
      const source = resolveSessionContext({ dir, sessionId: `thread-${command}` });
      fs.mkdirSync(source.runsDir, { recursive: true });
      const runPath = path.join(source.runsDir, "work.md");
      fs.writeFileSync(runPath, baseRun, "utf8");
      const before = snapshotTree(dir);
      const result = runDry(dir, [command, "--session", source.id, "--run", runPath]);
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.deepEqual(snapshotTree(dir), before, command);
      assert.equal(fs.existsSync(path.join(dir, "output")), false, command);
    });
  }
});

test("standalone native launch cannot auto-submit a prompt from a provisional owner", async () => {
  const dir = makeProject();
  const pending = createProvisionalContext({ dir });

  await assert.rejects(
    launchNativeCodexSession({ dir, context: pending, prompt: "do work", dryRun: true }),
    /NativeRemoteSession/i
  );
});
