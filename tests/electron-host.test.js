import test from "node:test";
import assert from "node:assert/strict";

import { ElectronSessionManager } from "../apps/qc-electron/session-manager.mjs";

class FakeNativeSession {
  constructor(options) {
    this.options = options;
    this.started = false;
    this.stopped = false;
    this.tasks = [];
    this.rawWrites = [];
    this.resizeCalls = [];
    this.controller = {
      isControllable: () => true,
      sendRaw: (text) => {
        this.rawWrites.push(text);
      }
    };
  }

  async start() {
    this.started = true;
    this.options.onOutputChunk?.("BOOT", { source: "pty-output" });
    return this;
  }

  async stop() {
    this.stopped = true;
  }

  async task(prompt) {
    this.tasks.push(prompt);
    return {
      prompt
    };
  }

  async slash(command) {
    return { command };
  }

  resize(cols, rows) {
    this.resizeCalls.push({ cols, rows });
    return true;
  }
}

function makeWrapperApi({
  modelRoute = { applied: false }
} = {}) {
  return {
    compileTaskPrompt: ({ route, task }) => `PROMPT:${route}:${task}`,
    ensureProjectBootstrap: ({ route }) => ({ route, scaffoldPresent: true, bootstrapRequired: false }),
    inspectActiveRunPreference: () => null,
    loadWrapperConfig: () => ({
      defaults: {
        permissionProfile: "safe",
        approvalMode: null
      }
    }),
    loadWrapperState: () => ({ version: 1, runs: {} }),
    readActiveRunArtifact: () => null,
    resolveExperienceModelRoute: async ({ task }) => {
      if (typeof modelRoute === "function") {
        return modelRoute(task);
      }
      return modelRoute;
    },
    resolveExperienceTaskRoute: async () => ({
      enabled: false,
      applied: false,
      needsDisambiguation: false
    }),
    resolvePermissionPolicy: () => ({
      permissionProfile: "safe",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      bypassApprovalsAndSandbox: false
    }),
    routeTask: ({ task }) => ({
      route: /review|explain/i.test(task) ? "direct" : "qc-flow",
      reason: "test route"
    })
  };
}

test("ElectronSessionManager keeps one native session alive across same-model orchestrated messages", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    createNativeSession: (options) => {
      const session = new FakeNativeSession(options);
      sessions.push(session);
      return session;
    },
    wrapperApi: makeWrapperApi()
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "orchestrated",
    dir: "/tmp/qc-electron-test"
  });
  await manager.submitTask("review the wrapper architecture");
  await manager.submitTask("explain the session boundary");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].tasks, [
    "PROMPT:direct:review the wrapper architecture",
    "PROMPT:direct:explain the session boundary"
  ]);
  assert.ok(events.some((event) => event.type === "task-route"));
});

test("ElectronSessionManager restarts the native session when model routing changes", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    createNativeSession: (options) => {
      const session = new FakeNativeSession(options);
      sessions.push(session);
      return session;
    },
    wrapperApi: makeWrapperApi({
      modelRoute: async (task) => task.includes("heavy")
        ? {
            applied: true,
            model: "gpt-5.4",
            reasoningEffort: "high",
            source: "test"
          }
        : {
            applied: false
          }
    })
  });

  await manager.startSession({
    mode: "orchestrated",
    dir: "/tmp/qc-electron-test"
  });
  await manager.submitTask("heavy architecture planning");

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].stopped, true);
  assert.equal(sessions[1].options.model, "gpt-5.4");
  assert.equal(sessions[1].options.reasoningEffort, "high");
  assert.deepEqual(sessions[1].tasks, [
    "PROMPT:qc-flow:heavy architecture planning"
  ]);
});

test("ElectronSessionManager forwards guarded slash commands to the active native session", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    createNativeSession: (options) => {
      const session = new FakeNativeSession(options);
      sessions.push(session);
      return session;
    },
    wrapperApi: makeWrapperApi()
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "orchestrated",
    dir: "/tmp/qc-electron-test"
  });
  const result = await manager.slash("/status");

  assert.equal(sessions.length, 1);
  assert.deepEqual(result, { command: "/status" });
  assert.ok(events.some((event) => event.type === "slash-result"));
});

test("ElectronSessionManager forwards raw terminal writes to the active native session controller", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    createNativeSession: (options) => {
      const session = new FakeNativeSession(options);
      sessions.push(session);
      return session;
    },
    wrapperApi: makeWrapperApi()
  });

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test"
  });
  await manager.writeRaw("hello native");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].rawWrites, ["hello native"]);
});

test("ElectronSessionManager forwards terminal resize requests to the active native session", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    createNativeSession: (options) => {
      const session = new FakeNativeSession(options);
      sessions.push(session);
      return session;
    },
    wrapperApi: makeWrapperApi()
  });

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test",
    cols: 100,
    rows: 30
  });

  const ok = manager.resize(132, 44);
  assert.equal(ok, true);
  assert.deepEqual(sessions[0].resizeCalls, [{ cols: 132, rows: 44 }]);
});
