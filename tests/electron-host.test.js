import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createQuickCodexHostApi } from "../host-api.js";
import { resolveElectronHostAppDir } from "../lib/electron-host.js";
import { enforceQcFlowProtocol, enforceQcLockProtocol } from "../lib/wrapper/protocol.js";
import { readActiveRunArtifact } from "../lib/wrapper/run-file.js";

const electronHostAppDir = resolveElectronHostAppDir({
  cwd: process.cwd(),
  env: process.env
});
const { ElectronSessionManager } = await import(
  pathToFileURL(path.join(electronHostAppDir, "session-manager.mjs")).href
);

class FakeNativeSession {
  constructor(options) {
    this.options = options;
    this.started = false;
    this.stopped = false;
    this.tasks = [];
    this.slashCommands = [];
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
    this.slashCommands.push(command);
    return { command };
  }

  resize(cols, rows) {
    this.resizeCalls.push({ cols, rows });
    return true;
  }
}

function makeHostApi({
  createNativeSession = (options) => new FakeNativeSession(options),
  modelRoute = { applied: false },
  continuation = null,
  ...overrides
} = {}) {
  const continuationResult = continuation ?? {
    flowState: {
      status: "active",
      currentGate: "execute",
      currentPhaseWave: "P1 / W1"
    },
    artifact: {
      relativeRunPath: ".quick-codex-flow/sample.md",
      currentGate: "execute",
      currentPhaseWave: "P1 / W1"
    },
    decision: {
      handoffAction: "resume-session",
      phaseRelation: "same-phase",
      nativeThreadAction: "thread/resume",
      prompt: "Resume the same run."
    }
  };

  return createQuickCodexHostApi({
    createNativeSession,
    createNativeSessionObserver: () => ({
      on() {},
      toJSON() {
        return { snapshot: null };
      }
    }),
    compileTaskPrompt: ({ route, task }) => `PROMPT:${route}:${task}`,
    enforceQcFlowProtocol: null,
    enforceQcLockProtocol: null,
    buildCheckpointSummary: ({ artifact, decision }) => ({
      run: artifact.relativeRunPath,
      prompt: decision.prompt,
      summary: `Checkpoint summary for ${artifact.relativeRunPath}`
    }),
    classifyAutoFollowStop: ({ previousArtifact, artifact, flowState, decision }) => {
      const checkpointAdvanced = previousArtifact !== artifact
        && flowState.status === "active"
        && Boolean(decision.handoffAction);
      if (previousArtifact && !checkpointAdvanced) {
        return {
          shouldStop: true,
          stopReason: "no-checkpoint-progress",
          checkpointAdvanced: false
        };
      }
      return {
        shouldStop: false,
        stopReason: null,
        checkpointAdvanced
      };
    },
    ensureProjectBootstrap: ({ route }) => ({ route, scaffoldPresent: true, bootstrapRequired: false }),
    inspectActiveRunPreference: () => null,
    loadWrapperConfig: () => ({
      defaults: {
        permissionProfile: "safe",
        approvalMode: null
      }
    }),
    loadWrapperState: () => ({ version: 1, runs: {} }),
    readActiveLockArtifact: () => null,
    readActiveRunArtifact: () => ({
      artifact: {
        relativeRunPath: ".quick-codex-flow/sample.md",
        currentGate: "execute",
        currentPhaseWave: "P1 / W0"
      }
    }),
    resolveAutoContinuation: () => {
      if (typeof continuationResult === "function") {
        return continuationResult();
      }
      return continuationResult;
    },
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
    }),
    ...overrides
  });
}

test("ElectronSessionManager keeps one native session alive across same-model orchestrated messages", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      }
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "orchestrated",
    dir: "/tmp/qc-electron-test",
    maxTurns: 1
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

test("Quick Codex publishes a public host API boundary and ElectronSessionManager imports only that surface", () => {
  const hostApi = createQuickCodexHostApi();
  const sessionManagerSource = fs.readFileSync(path.join(electronHostAppDir, "session-manager.mjs"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

  assert.equal(typeof hostApi.createNativeSession, "function");
  assert.equal(typeof hostApi.createNativeSessionObserver, "function");
  assert.equal(typeof hostApi.compileTaskPrompt, "function");
  assert.equal(typeof hostApi.enforceQcFlowProtocol, "function");
  assert.equal(typeof hostApi.enforceQcLockProtocol, "function");
  assert.ok(packageJson.files.includes("host-api.js"));
  assert.equal(packageJson.exports["./host-api"], "./host-api.js");
  assert.match(sessionManagerSource, /from "quick-codex\/host-api"/);
  assert.doesNotMatch(sessionManagerSource, /from "\.\.\/\.\.\/lib\/wrapper\/index\.js"/);
});

test("Electron host renderer HTML still exposes the managed task composer expected by renderer.js", () => {
  const rendererHtml = fs.readFileSync(path.join(electronHostAppDir, "renderer", "index.html"), "utf8");

  assert.match(rendererHtml, /id="inputbar"/);
  assert.match(rendererHtml, /id="task"/);
  assert.match(rendererHtml, /id="send"/);
});

test("Electron host renderer transcript contract exposes explicit route, protocol, and session-model-ready milestones", () => {
  const rendererSource = fs.readFileSync(path.join(electronHostAppDir, "renderer", "renderer.js"), "utf8");

  assert.match(rendererSource, /task-route \| route=\$\{uiState\.route\.route\}/);
  assert.match(rendererSource, /protocolEnforced=\$\{formatBool\(payload\.protocolEnforced\)\}/);
  assert.match(rendererSource, /protocol \| name=\$\{payload\.protocolName\}/);
  assert.match(rendererSource, /Protocol prompt injected \| source=\$\{uiState\.route\.promptSource\}/);
  assert.match(rendererSource, /Skill-equivalent: \$\{payload\.protocolName\}/);
  assert.match(rendererSource, /Gate enforced: \$\{payload\.protocolGate \|\| "none"\}/);
  assert.match(rendererSource, /model-route \| model=\$\{uiState\.session\.model\}/);
  assert.match(rendererSource, /session-model-ready \| model=\$\{uiState\.session\.model\}/);
  assert.match(rendererSource, /Stopped intentionally: qc-flow gate is still clarify\./);
  assert.match(rendererSource, /Next action: \$\{nextAction\}/);
});

test("Electron host renderer clears the managed task input immediately and restores it on send failure", () => {
  const rendererSource = fs.readFileSync(path.join(electronHostAppDir, "renderer", "renderer.js"), "utf8");

  assert.match(rendererSource, /const originalValue = taskInput\?\.value \?\? "";/);
  assert.match(rendererSource, /if \(taskInput\) {\s+taskInput\.value = "";\s+}/);
  assert.match(rendererSource, /catch \(error\) {\s+if \(taskInput && !taskInput\.value\) {\s+taskInput\.value = originalValue;/);
});

test("ElectronSessionManager can route an intercepted passthrough message through the managed QC path", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      }
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test",
    maxTurns: 1
  });
  const submitted = await manager.submitInterceptedTask("review the host boundary");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].tasks, [
    "PROMPT:direct:review the host boundary"
  ]);
  assert.equal(submitted.routed.route, "direct");
  assert.equal(submitted.follow.turnsExecuted, 1);
  assert.equal(events.find((event) => event.type === "task-route")?.source, "passthrough-intercept");
});

test("ElectronSessionManager re-routes later passthrough turns on the same live session and updates telemetry-driving state", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-electron-reroute-"));
  fs.mkdirSync(path.join(dir, ".quick-codex-flow"), { recursive: true });

  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      continuation: {
        flowState: {
          status: "done",
          currentGate: "clarify",
          currentPhaseWave: "P1 / W1"
        },
        artifact: {
          relativeRunPath: ".quick-codex-flow/sample.md",
          currentGate: "clarify",
          currentPhaseWave: "P1 / W1"
        },
        decision: {
          handoffAction: null,
          phaseRelation: "completed",
          nativeThreadAction: null,
          prompt: "Stop after the current turn."
        }
      },
      enforceQcFlowProtocol,
      routeTask: ({ task }) => {
        if (/explore|plan|research/i.test(task)) {
          return { route: "qc-flow", reason: "broad planning task" };
        }
        return { route: "direct", reason: "read-only explanation task" };
      }
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir,
    maxTurns: 1
  });
  const first = await manager.submitInterceptedTask("Explore Storyflow anti-bot behavior and plan the hardening work");
  const second = await manager.submitInterceptedTask("Explain the current Storyflow anti-bot architecture in plain language");

  assert.equal(sessions.length, 1);
  assert.equal(first.routed.route, "qc-flow");
  assert.equal(first.routed.protocolEnforced, true);
  assert.equal(first.routed.protocolName, "qc-flow");
  assert.equal(first.routed.protocolGate, "clarify");

  assert.equal(second.routed.route, "direct");
  assert.equal(second.routed.protocolEnforced, false);
  assert.equal(second.routed.protocolName, null);
  assert.equal(second.routed.protocolGate, null);

  const taskRouteEvents = events.filter((event) => event.type === "task-route");
  assert.equal(taskRouteEvents.length, 2);
  assert.equal(taskRouteEvents[0].route, "qc-flow");
  assert.equal(taskRouteEvents[0].protocolName, "qc-flow");
  assert.equal(taskRouteEvents[0].protocolGate, "clarify");
  assert.equal(taskRouteEvents[1].route, "direct");
  assert.equal(taskRouteEvents[1].protocolEnforced, false);
  assert.equal(taskRouteEvents[1].protocolName, null);
  assert.equal(taskRouteEvents[1].protocolGate, null);

  assert.equal(manager.snapshot().lastDecision.route, "direct");
  assert.equal(manager.snapshot().lastDecision.protocolEnforced, false);
  assert.equal(manager.snapshot().lastRouteTask.applied, false);

  assert.equal(sessions[0].tasks[1], "PROMPT:direct:Explain the current Storyflow anti-bot architecture in plain language");
  assert.match(sessions[0].tasks[0], /Protocol enforcement: passthrough qc-flow contract is active/);
});

test("ElectronSessionManager can re-route a later passthrough turn from qc-flow into qc-lock on the same live session", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-electron-reroute-lock-"));
  fs.mkdirSync(path.join(dir, ".quick-codex-flow"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".quick-codex-flow", "storyflow-plan.md"), `# Run: storyflow-plan

## Requirement Baseline
Original goal:
- Implement Storyflow telemetry hardening

## Resume Digest
- Goal: Implement Storyflow telemetry hardening
- Execution mode: auto
- Current gate: execute
- Current phase / wave: P2 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`dotnet test Storyflow.Host.Tests\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/storyflow-plan.md\`

## Clarify State
Goal:
- Implement Storyflow telemetry hardening

Affected area / blast radius:
- src/Host telemetry partitioning and its targeted tests

## Research Pack
Confirmed the Storyflow telemetry partitioning paths and the targeted tests.

## Verified Plan
Phase table:
- P2 / W1: implement the telemetry hardening change and verify targeted tests

## Current Execution Wave
Execute the trusted telemetry hardening change and verify targeted tests.

## Current Status
Current phase: P2
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/storyflow-plan.md\`

## Blockers
- none
`, "utf8");
  fs.writeFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), `# Quick Codex Flow State

Active run:
- .quick-codex-flow/storyflow-plan.md

Active lock:
- none

Current gate:
- execute

Current phase / wave:
- P2 / W1

Execution mode:
- auto

Status:
- active
`, "utf8");

  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      continuation: {
        flowState: {
          status: "done",
          currentGate: "execute",
          currentPhaseWave: "P2 / W1"
        },
        artifact: {
          relativeRunPath: ".quick-codex-flow/storyflow-plan.md",
          currentGate: "execute",
          currentPhaseWave: "P2 / W1"
        },
        decision: {
          handoffAction: null,
          phaseRelation: "completed",
          nativeThreadAction: null,
          prompt: "Stop after the current turn."
        }
      },
      enforceQcFlowProtocol,
      enforceQcLockProtocol,
      readActiveRunArtifact: (currentDir) => readActiveRunArtifact(currentDir),
      routeTask: ({ task }) => {
        if (/explore|plan|research/i.test(task)) {
          return { route: "qc-flow", reason: "broad planning task" };
        }
        return { route: "qc-lock", reason: "narrow execution task" };
      }
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir,
    maxTurns: 1
  });

  const first = await manager.submitInterceptedTask("Explore Storyflow anti-bot behavior and plan the hardening work");
  const second = await manager.submitInterceptedTask("Take finding 1 first. Propose the exact Storyflow code changes, implement them, and verify the result before moving to the next step.");

  assert.equal(sessions.length, 1);
  assert.equal(first.routed.route, "qc-flow");
  assert.equal(first.routed.protocolEnforced, true);
  assert.equal(first.routed.protocolName, "qc-flow");
  assert.equal(first.routed.protocolGate, "execute");

  assert.equal(second.routed.route, "qc-lock");
  assert.equal(second.routed.protocolEnforced, true);
  assert.equal(second.routed.protocolName, "qc-lock");
  assert.equal(second.routed.protocolGate, "execute");

  const taskRouteEvents = events.filter((event) => event.type === "task-route");
  assert.equal(taskRouteEvents.length, 2);
  assert.equal(taskRouteEvents[0].route, "qc-flow");
  assert.equal(taskRouteEvents[0].protocolName, "qc-flow");
  assert.equal(taskRouteEvents[0].protocolGate, "execute");
  assert.equal(taskRouteEvents[1].route, "qc-lock");
  assert.equal(taskRouteEvents[1].protocolName, "qc-lock");
  assert.equal(taskRouteEvents[1].protocolGate, "execute");
  assert.equal(taskRouteEvents[1].protocolHandoffArtifactRun, ".quick-codex-flow/storyflow-plan.md");

  assert.equal(manager.snapshot().lastDecision.route, "qc-lock");
  assert.equal(manager.snapshot().lastDecision.protocolEnforced, true);
  assert.equal(manager.snapshot().lastDecision.protocolName, "qc-lock");

  assert.match(sessions[0].tasks[0], /Current enforced gate: execute/);
  assert.match(sessions[0].tasks[1], /Trusted upstream handoff: \.quick-codex-flow\/storyflow-plan\.md/);
  assert.match(sessions[0].tasks[1], /Stay in strict qc-lock execution mode/);
});

test("ElectronSessionManager applies qc-flow protocol enforcement for broad passthrough tasks before execution starts", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-electron-protocol-"));
  fs.mkdirSync(path.join(dir, ".quick-codex-flow"), { recursive: true });
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      enforceQcFlowProtocol
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir,
    maxTurns: 1
  });
  const submitted = await manager.submitInterceptedTask("Explore Storyflow anti-bot behavior and plan the hardening work");

  assert.equal(sessions.length, 1);
  assert.equal(submitted.routed.route, "qc-flow");
  assert.equal(submitted.routed.protocolEnforced, true);
  assert.equal(submitted.routed.protocolGate, "clarify");
  assert.match(sessions[0].tasks[0], /Current enforced gate: clarify/);
  assert.match(sessions[0].tasks[0], /Do not implement code, do not edit product files/);
  assert.match(fs.readFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), "utf8"), /Current gate:\n- clarify/);
  assert.equal(events.find((event) => event.type === "task-route")?.protocolGate, "clarify");
});

test("ElectronSessionManager applies qc-lock protocol enforcement and trusted flow handoff for narrow passthrough execution tasks", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-electron-lock-protocol-"));
  fs.mkdirSync(path.join(dir, ".quick-codex-flow"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".quick-codex-flow", "storyflow-plan.md"), `# Run: storyflow-plan

## Requirement Baseline
Original goal:
- Implement Storyflow telemetry hardening

## Resume Digest
- Goal: Implement Storyflow telemetry hardening
- Execution mode: auto
- Current gate: execute
- Current phase / wave: P2 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`dotnet test Storyflow.Host.Tests\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/storyflow-plan.md\`

## Clarify State
Goal:
- Implement Storyflow telemetry hardening

Affected area / blast radius:
- src/Host telemetry partitioning and its targeted tests

## Research Pack
Confirmed the Storyflow telemetry partitioning paths and the targeted tests.

## Verified Plan
Phase table:
- P2 / W1: implement the telemetry hardening change and verify targeted tests

## Current Execution Wave
Execute the trusted telemetry hardening change and verify targeted tests.

## Current Status
Current phase: P2
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/storyflow-plan.md\`

## Blockers
- none
`, "utf8");
  fs.writeFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), `# Quick Codex Flow State

Active run:
- .quick-codex-flow/storyflow-plan.md

Active lock:
- none

Current gate:
- execute

Current phase / wave:
- P2 / W1

Execution mode:
- auto

Status:
- active
`, "utf8");

  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      enforceQcFlowProtocol,
      enforceQcLockProtocol,
      readActiveRunArtifact: (currentDir) => readActiveRunArtifact(currentDir),
      routeTask: () => ({
        route: "qc-lock",
        reason: "test route"
      })
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir,
    maxTurns: 1
  });
  const submitted = await manager.submitInterceptedTask("Take finding 1 first. Propose the exact Storyflow code changes, implement them, and verify the result before moving to the next step.");

  assert.equal(sessions.length, 1);
  assert.equal(submitted.routed.route, "qc-lock");
  assert.equal(submitted.routed.protocolEnforced, true);
  assert.equal(submitted.routed.protocolName, "qc-lock");
  assert.equal(submitted.routed.protocolGate, "execute");
  assert.match(sessions[0].tasks[0], /Trusted upstream handoff: \.quick-codex-flow\/storyflow-plan\.md/);
  assert.match(sessions[0].tasks[0], /Stay in strict qc-lock execution mode/);
  assert.match(fs.readFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), "utf8"), /Active lock:\n- \.quick-codex-lock\//);
  assert.equal(events.find((event) => event.type === "task-route")?.protocolName, "qc-lock");
});

test("ElectronSessionManager maps passthrough follow decisions to guarded /clear when the continuity handoff requires it", async () => {
  const clearContinuation = {
    flowState: {
      status: "active",
      currentGate: "execute",
      currentPhaseWave: "P1 / W1"
    },
    artifact: {
      relativeRunPath: ".quick-codex-flow/sample.md",
      currentGate: "execute",
      currentPhaseWave: "P1 / W2"
    },
    decision: {
      handoffAction: "clear-session",
      phaseRelation: "independent-next-phase",
      nativeThreadAction: "thread/start",
      prompt: "Start clean after clear."
    }
  };
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      continuation: clearContinuation
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test",
    maxTurns: 3
  });
  const submitted = await manager.submitInterceptedTask("plan a fresh follow-on phase");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].slashCommands, ["/clear"]);
  assert.deepEqual(sessions[0].tasks, [
    "PROMPT:qc-flow:plan a fresh follow-on phase",
    "Start clean after clear."
  ]);
  assert.equal(submitted.follow.stoppedBecause, "no-checkpoint-progress");
  assert.equal(events.find((event) => event.type === "follow-loop-action")?.slashCommand, "/clear");
});

test("ElectronSessionManager maps passthrough follow decisions to guarded /resume --last when the continuity handoff requires it", async () => {
  const resumeAdvanced = {
    relativeRunPath: ".quick-codex-flow/sample.md",
    currentGate: "execute",
    currentPhaseWave: "P1 / W2"
  };
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      continuation: () => ({
        flowState: {
          status: "active",
          currentGate: "execute",
          currentPhaseWave: "P1 / W1"
        },
        artifact: resumeAdvanced,
        decision: {
          handoffAction: "resume-session",
          phaseRelation: "same-phase",
          nativeThreadAction: "thread/resume",
          prompt: "Continue after resume."
        }
      })
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test",
    maxTurns: 3
  });
  const submitted = await manager.submitInterceptedTask("resume the same run invisibly");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].slashCommands, ["/resume --last"]);
  assert.deepEqual(sessions[0].tasks, [
    "PROMPT:qc-flow:resume the same run invisibly",
    "Continue after resume."
  ]);
  assert.equal(submitted.follow.stoppedBecause, "no-checkpoint-progress");
  assert.equal(events.find((event) => event.type === "follow-loop-action")?.slashCommand, "/resume --last");
});

test("ElectronSessionManager can chain multiple passthrough continuity turns on the same live session", async () => {
  const artifactOne = {
    relativeRunPath: ".quick-codex-flow/sample.md",
    currentGate: "execute",
    currentPhaseWave: "P1 / W2"
  };
  const artifactTwo = {
    relativeRunPath: ".quick-codex-flow/sample.md",
    currentGate: "execute",
    currentPhaseWave: "P1 / W3"
  };
  const continuationSteps = [
    {
      flowState: {
        status: "active",
        currentGate: "execute",
        currentPhaseWave: "P1 / W1"
      },
      artifact: artifactOne,
      decision: {
        handoffAction: "resume-session",
        phaseRelation: "same-phase",
        nativeThreadAction: "thread/resume",
        prompt: "Continue after resume."
      }
    },
    {
      flowState: {
        status: "active",
        currentGate: "execute",
        currentPhaseWave: "P1 / W2"
      },
      artifact: artifactTwo,
      decision: {
        handoffAction: "compact-session",
        phaseRelation: "same-phase",
        nativeThreadAction: "thread/compact/start",
        prompt: "Continue after compact."
      }
    },
    {
      flowState: {
        status: "active",
        currentGate: "execute",
        currentPhaseWave: "P1 / W2"
      },
      artifact: artifactTwo,
      decision: {
        handoffAction: "compact-session",
        phaseRelation: "same-phase",
        nativeThreadAction: "thread/compact/start",
        prompt: "Continue after compact."
      }
    }
  ];
  let continuationIndex = 0;
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      continuation: () => continuationSteps[Math.min(continuationIndex++, continuationSteps.length - 1)]
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test",
    maxTurns: 4
  });
  const submitted = await manager.submitInterceptedTask("advance invisibly through two checkpoints");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].slashCommands, ["/resume --last", "/compact"]);
  assert.deepEqual(sessions[0].tasks, [
    "PROMPT:qc-flow:advance invisibly through two checkpoints",
    "Continue after resume.",
    "Continue after compact."
  ]);
  assert.equal(submitted.follow.turnsExecuted, 3);
  assert.equal(submitted.follow.stoppedBecause, "no-checkpoint-progress");
  assert.deepEqual(
    events.filter((event) => event.type === "follow-loop-action").map((event) => event.slashCommand),
    ["/resume --last", "/compact"]
  );
});

test("ElectronSessionManager evaluates follow-loop continuation after each orchestrated task", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      }
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "orchestrated",
    dir: "/tmp/qc-electron-test",
    maxTurns: 3
  });
  const submitted = await manager.submitTask("plan the next wave");
  const followDecisions = events.filter((event) => event.type === "follow-loop-decision");
  const followAction = events.find((event) => event.type === "follow-loop-action");
  const followFinished = events.find((event) => event.type === "follow-loop-finished");

  assert.equal(sessions.length, 1);
  assert.equal(submitted.continuation.shouldStop, false);
  assert.equal(submitted.continuation.stopReason, null);
  assert.equal(submitted.continuation.checkpointAdvanced, true);
  assert.equal(sessions[0].slashCommands.length, 1);
  assert.deepEqual(sessions[0].slashCommands, ["/resume --last"]);
  assert.deepEqual(sessions[0].tasks, [
    "PROMPT:qc-flow:plan the next wave",
    "Resume the same run."
  ]);
  assert.equal(submitted.follow.turnsExecuted, 2);
  assert.equal(submitted.follow.stoppedBecause, "no-checkpoint-progress");
  assert.equal(followDecisions[0]?.artifactRun, ".quick-codex-flow/sample.md");
  assert.equal(followDecisions[0]?.handoffAction, "resume-session");
  assert.equal(followDecisions[0]?.continuePrompt, "Resume the same run.");
  assert.equal(followDecisions[0]?.checkpointSummary?.summary, "Checkpoint summary for .quick-codex-flow/sample.md");
  assert.equal(followAction?.slashCommand, "/resume --last");
  assert.equal(followAction?.continuePrompt, "Resume the same run.");
  assert.equal(followFinished?.turnsExecuted, 2);
});

test("ElectronSessionManager surfaces follow-loop stop reasons without executing continuity actions yet", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      continuation: {
        flowState: {
          status: "active",
          currentGate: "execute",
          currentPhaseWave: "P1 / W1"
        },
        artifact: {
          relativeRunPath: ".quick-codex-flow/sample.md",
          currentGate: "execute",
          currentPhaseWave: "P1 / W1"
        },
        decision: {
          handoffAction: "relock-first",
          phaseRelation: "relock-before-next-phase",
          nativeThreadAction: null,
          prompt: "Relock before continuing."
        }
      },
      modelRoute: { applied: false }
    })
  });

  manager.hostApi = makeHostApi({
    createNativeSession: manager.hostApi.createNativeSession,
    continuation: {
      flowState: {
        status: "active",
        currentGate: "execute",
        currentPhaseWave: "P1 / W1"
      },
      artifact: {
        relativeRunPath: ".quick-codex-flow/sample.md",
        currentGate: "execute",
        currentPhaseWave: "P1 / W1"
      },
      decision: {
        handoffAction: "relock-first",
        phaseRelation: "relock-before-next-phase",
        nativeThreadAction: null,
        prompt: "Relock before continuing."
      }
    },
    modelRoute: { applied: false },
    classifyAutoFollowStop: () => ({
      shouldStop: true,
      stopReason: "relock",
      checkpointAdvanced: true
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "orchestrated",
    dir: "/tmp/qc-electron-test",
    maxTurns: 1
  });
  const submitted = await manager.submitTask("execute a guarded relock boundary");
  const followDecision = events.find((event) => event.type === "follow-loop-decision");
  const followAction = events.find((event) => event.type === "follow-loop-action");
  const followFinished = events.find((event) => event.type === "follow-loop-finished");

  assert.equal(sessions.length, 1);
  assert.equal(submitted.continuation.shouldStop, true);
  assert.equal(submitted.continuation.stopReason, "relock");
  assert.deepEqual(sessions[0].slashCommands, []);
  assert.deepEqual(sessions[0].tasks, ["PROMPT:qc-flow:execute a guarded relock boundary"]);
  assert.equal(followDecision?.phaseRelation, "relock-before-next-phase");
  assert.equal(followDecision?.continuePrompt, "Relock before continuing.");
  assert.equal(followAction, undefined);
  assert.equal(followFinished?.stoppedBecause, "relock");
});

test("ElectronSessionManager restarts the native session when model routing changes", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
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
    dir: "/tmp/qc-electron-test",
    maxTurns: 1
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

test("ElectronSessionManager emits model-route before session-model-ready and task-result when routed model restart is required", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      },
      modelRoute: async (task) => task.includes("heavy")
        ? {
            applied: true,
            model: "gpt-5.3-codex",
            reasoningEffort: "medium",
            source: "test"
          }
        : {
            applied: false
          }
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test",
    maxTurns: 1
  });
  await manager.submitInterceptedTask("heavy architecture planning");

  const taskRouteIndex = events.findIndex((event) => event.type === "task-route");
  const modelRouteIndex = events.findIndex((event) => event.type === "model-route");
  const modelReadyIndex = events.findIndex((event) => event.type === "session-model-ready");
  const taskResultIndex = events.findIndex((event) => event.type === "task-result");

  assert.equal(sessions.length, 2);
  assert.notEqual(taskRouteIndex, -1);
  assert.notEqual(modelRouteIndex, -1);
  assert.notEqual(modelReadyIndex, -1);
  assert.notEqual(taskResultIndex, -1);
  assert.ok(taskRouteIndex < modelRouteIndex);
  assert.ok(modelRouteIndex < modelReadyIndex);
  assert.ok(modelReadyIndex < taskResultIndex);
  assert.equal(events[modelRouteIndex]?.model, "gpt-5.3-codex");
  assert.equal(events[modelReadyIndex]?.model, "gpt-5.3-codex");
  assert.equal(events[modelReadyIndex]?.reasoningEffort, "medium");
});

test("ElectronSessionManager forwards native submit retry milestones through progress events in passthrough mode", async () => {
  class RetryProgressSession extends FakeNativeSession {
    async task(prompt, { onProgress } = {}) {
      this.tasks.push(prompt);
      onProgress?.("native-task=await-ready | retries=2");
      onProgress?.("native-task=sent");
      onProgress?.("native-task=retry-submit | retry=1");
      onProgress?.("native-task=started | retries=1");
      return { prompt };
    }
  }

  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => new RetryProgressSession(options),
      routeTask: () => ({ route: "direct", reason: "retry visibility test" })
    })
  });

  const events = [];
  manager.on("session-event", (event) => events.push(event));

  await manager.startSession({
    mode: "passthrough",
    dir: "/tmp/qc-electron-test",
    maxTurns: 1
  });
  await manager.submitInterceptedTask("retry submit path");

  const progressEntries = events
    .filter((event) => event.type === "progress")
    .map((event) => event.entry);

  assert.ok(progressEntries.includes("native-task=await-ready | retries=2"));
  assert.ok(progressEntries.includes("native-task=sent"));
  assert.ok(progressEntries.includes("native-task=retry-submit | retry=1"));
  assert.ok(progressEntries.includes("native-task=started | retries=1"));
});

test("ElectronSessionManager forwards guarded slash commands to the active native session", async () => {
  const sessions = [];
  const manager = new ElectronSessionManager({
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      }
    })
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
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      }
    })
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
    hostApi: makeHostApi({
      createNativeSession: (options) => {
        const session = new FakeNativeSession(options);
        sessions.push(session);
        return session;
      }
    })
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
