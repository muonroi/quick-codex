import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { routedWaveRun, runWrapCli, runWrapCliWithEnv, runWrapCliWithInputAndEnv, runCodexShimWithEnv, runCodexShimWithInputAndEnv, runCli, writeStateFile, makeProject, baseRun } from "./test-helpers.js";
import { ensureProjectBootstrap, inspectProjectBootstrap } from "../lib/wrapper/bootstrap.js";
import { classifyAutoFollowStop } from "../lib/wrapper/follow-loop.js";
import { launchNativeCodexSession, NativeRemoteSession, NativeSessionController, NativeSessionObserver, sendNativeTaskWithRetry } from "../lib/wrapper/native-session.js";

function flowArtifact({ phaseWave, nextPrompt, blockers = ["none"], gate = "execute", executionState = "in_progress" }) {
  const [phase, wave] = phaseWave.split(" / ");
  const blockerLines = blockers.map((entry) => `- ${entry}`).join("\n");
  return `# Run: sample

## Requirement Baseline
Original goal:
- follow wrapper checkpoints automatically

## Resume Digest
- Goal: follow wrapper checkpoints automatically
- Execution mode: manual
- Current gate: ${gate}
- Current phase / wave: ${phaseWave}
- Remaining blockers: ${blockers[0] ?? "none"}
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`printf check-${wave.toLowerCase()}\`
- Recommended next command: \`${nextPrompt}\`

## Compact-Safe Summary
- Goal: follow wrapper checkpoints automatically
- Current gate: ${gate}
- Current phase / wave: ${phaseWave}
- Requirements still satisfied: R1
- Remaining blockers: ${blockers[0] ?? "none"}
- Experience constraints: none
- Active hook-derived invariants: none
- Phase relation: same-phase
- Carry-forward invariants: keep the active artifact as the source of truth
- Suggested session action: \`/compact\` after reviewing this summary and resume payload.
- What to forget: prior turn chatter
- What must remain loaded: current phase / wave and next command
- Next verify: \`printf check-${wave.toLowerCase()}\`
- Resume with: \`${nextPrompt}\`

## Next Wave Pack
- Target: ${phaseWave}
- Derived from: ${phaseWave}
- Phase relation: same-phase
- Compaction action: compact
- Suggested session action: \`/compact\` after reviewing this summary and resume payload.
- Wave goal: continue ${phaseWave}
- Done when: the next checkpoint is written
- Next verify: \`printf check-${wave.toLowerCase()}\`
- What to forget: prior turn chatter
- What must remain loaded: current phase / wave and next command
- Resume payload: \`${nextPrompt}\`

## Current Status
Current phase: ${phase}
Current wave: ${wave}
Execution state: ${executionState}

## Recommended Next Command
- \`${nextPrompt}\`

## Blockers
${blockerLines}
`;
}

function makeFakeCodex(projectDir, stages) {
  const scriptPath = path.join(projectDir, "fake-codex.mjs");
  const manifestPath = path.join(projectDir, "fake-codex-manifest.json");
  const counterPath = path.join(projectDir, "fake-codex-counter.txt");
  const argvPath = path.join(projectDir, "fake-codex-argv.json");
  const artifactPath = path.join(projectDir, ".quick-codex-flow", "sample.md");
  const statePath = path.join(projectDir, ".quick-codex-flow", "STATE.md");
  const materializedStages = {};

  stages.forEach((stage, index) => {
    const key = String(index + 1);
    const artifactStagePath = path.join(projectDir, `.stage-${key}-artifact.md`);
    const stateStagePath = path.join(projectDir, `.stage-${key}-state.md`);
    fs.writeFileSync(artifactStagePath, stage.artifact, "utf8");
    fs.writeFileSync(stateStagePath, stage.state, "utf8");
    materializedStages[key] = {
      artifactPath: artifactStagePath,
      statePath: stateStagePath
    };
  });

  fs.writeFileSync(manifestPath, JSON.stringify(materializedStages, null, 2), "utf8");
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(process.env.FAKE_CODEX_MANIFEST, "utf8"));
const counterPath = process.env.FAKE_CODEX_COUNTER;
const argvPath = process.env.FAKE_CODEX_ARGV;
const artifactPath = process.env.FAKE_CODEX_ARTIFACT;
const statePath = process.env.FAKE_CODEX_STATE;
const lastMessage = process.env.FAKE_CODEX_LAST_MESSAGE || "FAKE_CODEX_OK";
const previous = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, "utf8")) : 0;
const next = previous + 1;
const args = process.argv.slice(2);
fs.writeFileSync(counterPath, String(next), "utf8");
fs.writeFileSync(argvPath, JSON.stringify(args, null, 2), "utf8");
const stage = manifest[String(next)];
if (stage) {
  fs.copyFileSync(stage.artifactPath, artifactPath);
  fs.copyFileSync(stage.statePath, statePath);
}
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex !== -1 && outputIndex + 1 < args.length) {
  fs.writeFileSync(args[outputIndex + 1], lastMessage + "\\n", "utf8");
}
console.log(JSON.stringify({ type: "thread.started", thread_id: \`00000000-0000-4000-8000-\${String(next).padStart(12, "0")}\` }));
console.log(JSON.stringify({ type: "turn.completed" }));
`, "utf8");
  fs.chmodSync(scriptPath, 0o755);

  return {
    scriptPath,
    env: {
      QUICK_CODEX_WRAP_CODEX_BIN: scriptPath,
      FAKE_CODEX_LAST_MESSAGE: "fake codex assistant reply",
      FAKE_CODEX_MANIFEST: manifestPath,
      FAKE_CODEX_COUNTER: counterPath,
      FAKE_CODEX_ARGV: argvPath,
      FAKE_CODEX_ARTIFACT: artifactPath,
      FAKE_CODEX_STATE: statePath
    },
    argvPath
  };
}

function makeFakeAppServer(projectDir, {
  threadId = "123e4567-e89b-42d3-a456-426614174999",
  turnId = "123e4567-e89b-42d3-a456-426614175000",
  compactTurnId = "123e4567-e89b-42d3-a456-426614175001",
  finalText = "native app-server final answer",
  stages = [],
  threadResumeErrorMessage = null
} = {}) {
  const scriptPath = path.join(projectDir, "fake-app-server.mjs");
  const manifestPath = path.join(projectDir, "fake-app-server-manifest.json");
  const counterPath = path.join(projectDir, "fake-app-server-counter.txt");
  const startupCountPath = path.join(projectDir, "fake-app-server-startups.txt");
  const argvPath = path.join(projectDir, "fake-app-server-argv.jsonl");
  const artifactPath = path.join(projectDir, ".quick-codex-flow", "sample.md");
  const statePath = path.join(projectDir, ".quick-codex-flow", "STATE.md");
  const materializedStages = {};

  stages.forEach((stage, index) => {
    const key = String(index + 1);
    const artifactStagePath = path.join(projectDir, `.fake-app-stage-${key}-artifact.md`);
    const stateStagePath = path.join(projectDir, `.fake-app-stage-${key}-state.md`);
    fs.writeFileSync(artifactStagePath, stage.artifact, "utf8");
    fs.writeFileSync(stateStagePath, stage.state, "utf8");
    materializedStages[key] = {
      artifactPath: artifactStagePath,
      statePath: stateStagePath
    };
  });

  fs.writeFileSync(manifestPath, JSON.stringify(materializedStages, null, 2), "utf8");
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const threadId = process.env.FAKE_APP_SERVER_THREAD_ID;
const turnId = process.env.FAKE_APP_SERVER_TURN_ID;
const compactTurnId = process.env.FAKE_APP_SERVER_COMPACT_TURN_ID;
const finalText = process.env.FAKE_APP_SERVER_FINAL_TEXT;
const manifestPath = process.env.FAKE_APP_SERVER_MANIFEST;
const counterPath = process.env.FAKE_APP_SERVER_COUNTER;
const startupCountPath = process.env.FAKE_APP_SERVER_STARTUP_COUNT;
const argvPath = process.env.FAKE_APP_SERVER_ARGV;
const artifactPath = process.env.FAKE_APP_SERVER_ARTIFACT;
const statePath = process.env.FAKE_APP_SERVER_STATE;
const threadResumeErrorMessage = process.env.FAKE_APP_SERVER_THREAD_RESUME_ERROR_MESSAGE;
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};

const previousStartups = fs.existsSync(startupCountPath) ? Number(fs.readFileSync(startupCountPath, "utf8")) : 0;
fs.writeFileSync(startupCountPath, String(previousStartups + 1), "utf8");
fs.appendFileSync(argvPath, JSON.stringify(process.argv.slice(2)) + "\\n", "utf8");

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}

rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { serverInfo: { name: "fake-app-server", version: "0.1.0" } } });
    return;
  }
  if (message.method === "initialized") {
    return;
  }
  if (message.method === "thread/start") {
    send({ jsonrpc: "2.0", id: message.id, result: { thread: { id: threadId } } });
    send({ jsonrpc: "2.0", method: "thread/started", params: { thread: { id: threadId } } });
    return;
  }
  if (message.method === "thread/resume") {
    if (threadResumeErrorMessage) {
      send({ jsonrpc: "2.0", id: message.id, error: { message: threadResumeErrorMessage } });
      return;
    }
    send({ jsonrpc: "2.0", id: message.id, result: { thread: { id: message.params.threadId } } });
    return;
  }
  if (message.method === "thread/compact/start") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    send({
      jsonrpc: "2.0",
      method: "turn/started",
      params: {
        threadId: message.params.threadId,
        turn: {
          id: compactTurnId,
          status: "inProgress",
          items: []
        }
      }
    });
    send({
      jsonrpc: "2.0",
      method: "item/started",
      params: {
        threadId: message.params.threadId,
        turnId: compactTurnId,
        item: {
          id: "compact-item-1",
          type: "contextCompaction"
        }
      }
    });
    send({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        threadId: message.params.threadId,
        turnId: compactTurnId,
        item: {
          id: "compact-item-1",
          type: "contextCompaction"
        }
      }
    });
    send({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: message.params.threadId,
        turn: {
          id: compactTurnId,
          status: "completed",
          items: []
        }
      }
    });
    return;
  }
  if (message.method === "turn/start") {
    const previous = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, "utf8")) : 0;
    const next = previous + 1;
    fs.writeFileSync(counterPath, String(next), "utf8");
    const stage = manifest[String(next)];
    if (stage) {
      fs.copyFileSync(stage.artifactPath, artifactPath);
      fs.copyFileSync(stage.statePath, statePath);
    }
    send({ jsonrpc: "2.0", id: message.id, result: { turn: { id: turnId, status: "inProgress" } } });
    send({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        threadId: message.params.threadId,
        turnId,
        item: {
          id: "item-1",
          type: "agentMessage",
          phase: "final_answer",
          text: finalText
        }
      }
    });
    send({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: message.params.threadId,
        turn: {
          id: turnId,
          status: "completed",
          items: []
        }
      }
    });
  }
});
`, "utf8");
  fs.chmodSync(scriptPath, 0o755);
  return {
    scriptPath,
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: scriptPath,
      FAKE_APP_SERVER_THREAD_ID: threadId,
      FAKE_APP_SERVER_TURN_ID: turnId,
      FAKE_APP_SERVER_COMPACT_TURN_ID: compactTurnId,
      FAKE_APP_SERVER_FINAL_TEXT: finalText,
      FAKE_APP_SERVER_MANIFEST: manifestPath,
      FAKE_APP_SERVER_COUNTER: counterPath,
      FAKE_APP_SERVER_STARTUP_COUNT: startupCountPath,
      FAKE_APP_SERVER_ARGV: argvPath,
      FAKE_APP_SERVER_ARTIFACT: artifactPath,
      FAKE_APP_SERVER_STATE: statePath,
      ...(threadResumeErrorMessage ? {
        FAKE_APP_SERVER_THREAD_RESUME_ERROR_MESSAGE: threadResumeErrorMessage
      } : {})
    },
    startupCountPath,
    argvPath
  };
}

function makeFakeNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-native-app-server.mjs");
  const appServerArgvPath = path.join(projectDir, "fake-native-app-server-argv.json");
  const codexScript = path.join(projectDir, "fake-native-codex.mjs");
  const codexArgvPath = path.join(projectDir, "fake-native-codex-argv.json");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
import fs from "node:fs";

const argvPath = process.env.FAKE_NATIVE_APP_SERVER_ARGV;
fs.writeFileSync(argvPath, JSON.stringify(process.argv.slice(2), null, 2), "utf8");
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4999");
console.log("  readyz: http://127.0.0.1:4999/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const argvPath = process.env.FAKE_NATIVE_CODEX_ARGV;
fs.writeFileSync(argvPath, JSON.stringify(process.argv.slice(2), null, 2), "utf8");
console.log("FAKE_NATIVE_CODEX_OK");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_NATIVE_APP_SERVER_ARGV: appServerArgvPath,
      FAKE_NATIVE_CODEX_ARGV: codexArgvPath
    },
    appServerArgvPath,
    codexArgvPath
  };
}

function makeFakeObservedNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-observed-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-observed-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-observed-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4888");
console.log("  readyz: http://127.0.0.1:4888/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_OBSERVED_NATIVE_STDIN;
const chunks = [];
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
});
console.log("\\u001b[2mWorking\\u001b[22m (1s)");
console.log("› waiting for next input");
setTimeout(() => {
  fs.writeFileSync(stdinPath, chunks.join(""), "utf8");
  console.log("To continue this session, run codex resume 019d9b43-1163-77f1-92f8-f51d1d19daf9");
  process.exit(0);
}, 40);
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_OBSERVED_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeObservedNativeBridgeStderr(projectDir) {
  const appServerScript = path.join(projectDir, "fake-observed-app-server-stderr.mjs");
  const codexScript = path.join(projectDir, "fake-observed-codex-stderr.mjs");
  const stdinPath = path.join(projectDir, "fake-observed-codex-stderr-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.error("codex app-server (WebSockets)");
console.error("  listening on: ws://127.0.0.1:4887");
console.error("  readyz: http://127.0.0.1:4887/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_OBSERVED_NATIVE_STDERR_STDIN;
const chunks = [];
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
});
console.log("\\u001b[2mWorking\\u001b[22m (1s)");
console.log("› waiting for next input");
setTimeout(() => {
  fs.writeFileSync(stdinPath, chunks.join(""), "utf8");
  console.log("To continue this session, run codex resume 019d9b43-1163-77f1-92f8-f51d1d19daf9");
  process.exit(0);
}, 40);
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_OBSERVED_NATIVE_STDERR_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeGuardedSlashNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-guarded-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-guarded-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-guarded-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4777");
console.log("  readyz: http://127.0.0.1:4777/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_GUARDED_NATIVE_STDIN;
const chunks = [];
let handled = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  if (handled) {
    return;
  }
  if (chunks.join("").includes("/status\\n")) {
    handled = true;
    console.log("Status panel open");
    console.log("› prompt restored after status");
    setTimeout(() => {
      fs.writeFileSync(stdinPath, chunks.join(""), "utf8");
      process.exit(0);
    }, 40);
  }
});
console.log("› prompt ready for guarded slash");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_GUARDED_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeGuardedCompactNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-guarded-compact-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-guarded-compact-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-guarded-compact-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4666");
console.log("  readyz: http://127.0.0.1:4666/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_GUARDED_COMPACT_NATIVE_STDIN;
const chunks = [];
let handled = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  if (handled) {
    return;
  }
  if (chunks.join("").includes("/compact\\n")) {
    handled = true;
    console.log("Compacting conversation...");
    setTimeout(() => {
      console.log("› prompt restored after compact");
      fs.writeFileSync(stdinPath, chunks.join(""), "utf8");
      process.exit(0);
    }, 40);
  }
});
console.log("› prompt ready for guarded compact");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_GUARDED_COMPACT_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeGuardedClearNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-guarded-clear-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-guarded-clear-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-guarded-clear-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4555");
console.log("  readyz: http://127.0.0.1:4555/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_GUARDED_CLEAR_NATIVE_STDIN;
const chunks = [];
let handled = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  if (handled) {
    return;
  }
  if (chunks.join("").includes("/clear\\n")) {
    handled = true;
    console.log("Clearing conversation...");
    setTimeout(() => {
      console.log("› prompt restored after clear");
      fs.writeFileSync(stdinPath, chunks.join(""), "utf8");
      process.exit(0);
    }, 40);
  }
});
console.log("› prompt ready for guarded clear");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_GUARDED_CLEAR_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeGuardedClearNativeBridgeWithRateLimitModal(projectDir) {
  const appServerScript = path.join(projectDir, "fake-guarded-clear-modal-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-guarded-clear-modal-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-guarded-clear-modal-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4544");
console.log("  readyz: http://127.0.0.1:4544/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_GUARDED_CLEAR_MODAL_NATIVE_STDIN;
const chunks = [];
let stage = "modal";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  const joined = chunks.join("");
  if (stage === "modal" && joined.includes("2")) {
    stage = "ready";
    console.log("› prompt restored after rate limit modal");
    return;
  }
  if (stage === "ready" && joined.includes("/clear\\n")) {
    stage = "done";
    console.log("Clearing conversation...");
    setTimeout(() => {
      console.log("› prompt restored after clear");
      fs.writeFileSync(stdinPath, joined, "utf8");
      process.exit(0);
    }, 40);
  }
});
console.log("Approaching rate limits");
console.log("Keep current model");
console.log("Press enter to confirm or esc to go back");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_GUARDED_CLEAR_MODAL_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeGuardedClearRetryNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-guarded-clear-retry-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-guarded-clear-retry-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-guarded-clear-retry-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4533");
console.log("  readyz: http://127.0.0.1:4533/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_GUARDED_CLEAR_RETRY_NATIVE_STDIN;
const chunks = [];
let stage = "waiting-command";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  const joined = chunks.join("");
  if (stage === "waiting-command" && joined.includes("/clear\\n")) {
    stage = "waiting-submit-retry";
    console.log("› /clear");
    return;
  }
  if (stage === "waiting-submit-retry" && joined.endsWith("/clear\\n\\n")) {
    stage = "done";
    console.log("Clearing conversation...");
    setTimeout(() => {
      console.log("› prompt restored after clear retry");
      fs.writeFileSync(stdinPath, joined, "utf8");
      process.exit(0);
    }, 40);
  }
});
console.log("› prompt ready for guarded clear retry");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_GUARDED_CLEAR_RETRY_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeGuardedResumeNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-guarded-resume-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-guarded-resume-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-guarded-resume-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4522");
console.log("  readyz: http://127.0.0.1:4522/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_GUARDED_RESUME_NATIVE_STDIN;
const chunks = [];
let handled = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  if (handled) {
    return;
  }
  const transcript = chunks.join("");
  const match = transcript.match(/\\/resume\\s+([^\\n]+)\\n/);
  if (match) {
    handled = true;
    console.log(\`Resumed session \${match[1]}\`);
    setTimeout(() => {
      console.log("› prompt restored after resume");
      fs.writeFileSync(stdinPath, transcript, "utf8");
      process.exit(0);
    }, 40);
  }
});
console.log("› prompt ready for guarded resume");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_GUARDED_RESUME_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

async function waitForFile(filePath, timeoutMs = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return fs.existsSync(filePath);
}

function makeFakeGuardedResumeTurnSettledNativeBridge(projectDir) {
  const appServerScript = path.join(projectDir, "fake-guarded-resume-turn-settled-app-server.mjs");
  const codexScript = path.join(projectDir, "fake-guarded-resume-turn-settled-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-guarded-resume-turn-settled-codex-stdin.txt");

  fs.writeFileSync(appServerScript, `#!/usr/bin/env node
console.log("codex app-server (WebSockets)");
console.log("  listening on: ws://127.0.0.1:4523");
console.log("  readyz: http://127.0.0.1:4523/readyz");
const timer = setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
`, "utf8");
  fs.chmodSync(appServerScript, 0o755);

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_GUARDED_RESUME_TURN_SETTLED_NATIVE_STDIN;
const chunks = [];
let stage = "waiting-command";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  const transcript = chunks.join("");
  if (stage === "waiting-command" && transcript.includes("/resume --last\\n")) {
    stage = "waiting-submit-retry";
    console.log("To continue this session, run codex resume 019d9c48-014c-7a70-b2cb-0ca76f652bbd");
    console.log("›sume--lasttab to queue message100% context left");
    return;
  }
  if (stage === "waiting-submit-retry" && transcript.endsWith("/resume --last\\n\\n")) {
    stage = "done";
    console.log("› prompt restored after resume retry");
    fs.writeFileSync(stdinPath, transcript, "utf8");
    process.exit(0);
  }
});
console.log("› prompt ready for guarded resume retry");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_WRAP_APP_SERVER_BIN: appServerScript,
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\n",
      FAKE_GUARDED_RESUME_TURN_SETTLED_NATIVE_STDIN: stdinPath
    },
    stdinPath
  };
}

function makeFakeNativeTaskMultiRetryCodex(projectDir, taskText) {
  const codexScript = path.join(projectDir, "fake-native-task-multi-retry-codex.mjs");
  const stdinPath = path.join(projectDir, "fake-native-task-multi-retry-stdin.txt");

  fs.writeFileSync(codexScript, `#!/usr/bin/env node
import fs from "node:fs";

const stdinPath = process.env.FAKE_NATIVE_TASK_MULTI_RETRY_STDIN;
const chunks = [];
let submitCount = 0;
let taskSeen = false;

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  chunks.push(chunk);
  const transcript = chunks.join("");
  fs.writeFileSync(stdinPath, transcript, "utf8");

  if (!taskSeen && transcript.includes(${JSON.stringify(taskText)})) {
    taskSeen = true;
  }
  if (!taskSeen) {
    return;
  }

  const tail = transcript.slice(-3);
  submitCount = (transcript.match(/\\n/g) || []).length;

  // 1st submit: echo prompt with the task still in composer.
  if (submitCount === 1) {
    console.log("› " + ${JSON.stringify(taskText)});
    return;
  }
  // 2nd submit: still stuck, echo again.
  if (submitCount === 2) {
    console.log("› " + ${JSON.stringify(taskText)});
    return;
  }
  // 3rd submit: task starts (busy boundary), then exit.
  if (submitCount >= 3) {
    console.log("•Working(0s • esc to interrupt)");
    setTimeout(() => process.exit(0), 30);
  }
});

console.log("› prompt ready for native task");
`, "utf8");
  fs.chmodSync(codexScript, 0o755);

  return {
    env: {
      QUICK_CODEX_REAL_CODEX_BIN: codexScript,
      QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: "\\n",
      FAKE_NATIVE_TASK_MULTI_RETRY_STDIN: stdinPath
    },
    codexScript,
    stdinPath
  };
}

async function withFakeExperienceRouter(options, fn) {
  const requests = [];
  let routeCallCount = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : {};
    requests.push({
      method: req.method,
      url: req.url,
      body
    });

    if (req.url === "/api/route-model") {
      routeCallCount += 1;
      const routeResult = typeof options.routeModel === "function"
        ? options.routeModel({ callCount: routeCallCount, body })
        : options.routeModel;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(routeResult));
      return;
    }

    if (req.url === "/api/route-task") {
      routeCallCount += 1;
      const routeResult = typeof options.routeTask === "function"
        ? options.routeTask({ callCount: routeCallCount, body })
        : options.routeTask;
      if (routeResult === undefined) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(routeResult));
      return;
    }

    if (req.url === "/api/route-feedback") {
      const feedbackResult = typeof options.routeFeedback === "function"
        ? options.routeFeedback({ body, callCount: routeCallCount })
        : (options.routeFeedback ?? { ok: true });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(feedbackResult));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn({ baseUrl, requests });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }));
  }
}

async function startFakeExperienceRouter(projectDir, {
  routeTaskResponses = [],
  routeModelResponses,
  routeFeedbackResponse = { ok: true },
  routeModelDelayMs = 0
}) {
  const scriptPath = path.join(projectDir, "fake-experience-router.mjs");
  const requestsPath = path.join(projectDir, "fake-experience-router-requests.jsonl");
  const manifestPath = path.join(projectDir, "fake-experience-router-manifest.json");

  fs.writeFileSync(manifestPath, JSON.stringify({
    routeTaskResponses,
    routeModelResponses,
    routeFeedbackResponse,
    routeModelDelayMs
  }, null, 2), "utf8");
  fs.writeFileSync(requestsPath, "", "utf8");
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";

const manifest = JSON.parse(fs.readFileSync(process.env.FAKE_EXPERIENCE_MANIFEST, "utf8"));
const requestsPath = process.env.FAKE_EXPERIENCE_REQUESTS;
let routeCallCount = 0;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const bodyText = Buffer.concat(chunks).toString("utf8");
  const body = bodyText ? JSON.parse(bodyText) : {};
  fs.appendFileSync(requestsPath, JSON.stringify({ method: req.method, url: req.url, body }) + "\\n", "utf8");

  if (req.url === "/api/route-model") {
    routeCallCount += 1;
    const responses = manifest.routeModelResponses || [];
    const routeResult = responses[Math.min(routeCallCount - 1, responses.length - 1)] || {};
    if (manifest.routeModelDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, manifest.routeModelDelayMs));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(routeResult));
    return;
  }

  if (req.url === "/api/route-task") {
    routeCallCount += 1;
    const responses = manifest.routeTaskResponses || [];
    if (responses.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const routeResult = responses[Math.min(routeCallCount - 1, responses.length - 1)] || {};
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(routeResult));
    return;
  }

  if (req.url === "/api/route-feedback") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(manifest.routeFeedbackResponse || { ok: true }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(String(address.port) + "\\n");
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
`, "utf8");
  fs.chmodSync(scriptPath, 0o755);

  const child = spawn(process.execPath, [scriptPath], {
    cwd: projectDir,
    env: {
      ...process.env,
      FAKE_EXPERIENCE_MANIFEST: manifestPath,
      FAKE_EXPERIENCE_REQUESTS: requestsPath
    },
    stdio: ["ignore", "pipe", "inherit"]
  });

  const port = await new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        resolve(Number(buffer.slice(0, newlineIndex).trim()));
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      reject(new Error(`fake experience router exited before reporting a port (code=${code ?? "null"})`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requestsPath,
    async close() {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  };
}

test("wrap prompt routes broad implementation work to qc-flow", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-flow-"));
  const result = runWrapCli(projectDir, "prompt", "--dir", projectDir, "--task", "build a thin wrapper before Codex CLI that auto-routes tasks, planning flow, and manual continuation steps", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-flow");
  assert.equal(payload.promptSource, "task-router");
  assert.match(payload.prompt, /Use \$qc-flow/);
  assert.match(payload.prompt, /task-specific run artifact under \.quick-codex-flow/);
});

test("wrap prompt routes narrow execution work to qc-lock", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-lock-"));
  const result = runWrapCli(projectDir, "prompt", "--dir", projectDir, "--task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.match(payload.prompt, /Use \$qc-lock/);
});

test("wrap prompt routes Vietnamese narrow execution work to qc-lock", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-lock-vi-"));
  const result = runWrapCli(projectDir, "prompt", "--dir", projectDir, "--task", "sửa lỗi chính tả trong README.md", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.match(payload.prompt, /Use \$qc-lock/);
});

test("wrap prompt routes Vietnamese broad planning work to qc-flow", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-flow-vi-"));
  const result = runWrapCli(projectDir, "prompt", "--dir", projectDir, "--task", "khảo sát quick-codex rồi lên kế hoạch cải thiện electron host", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-flow");
  assert.match(payload.prompt, /Use \$qc-flow/);
});

test("wrap prompt honors manual route override before brain or heuristic routing", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-override-"));
  const result = runWrapCli(projectDir, "prompt", "--dir", projectDir, "--task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--route-override", "qc-flow", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-flow");
  assert.equal(payload.routeSource, "manual-route-override");
  assert.equal(payload.promptSource, "manual-route-override");
  assert.match(payload.prompt, /Use \$qc-flow/);
  assert.match(payload.reason, /manual route override/i);
});

test("wrap prompt keeps read-only questions on the direct route", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-direct-"));
  const result = runWrapCli(projectDir, "prompt", "--dir", projectDir, "--task", "explain how the wrapper state file works", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "direct");
  assert.doesNotMatch(payload.prompt, /Use \$qc-flow/);
  assert.doesNotMatch(payload.prompt, /Use \$qc-lock/);
});

test("wrap prompt keeps Vietnamese read-only questions on the direct route", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-direct-vi-"));
  const result = runWrapCli(projectDir, "prompt", "--dir", projectDir, "--task", "giải thích kiến trúc hiện tại của wrapper", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "direct");
  assert.doesNotMatch(payload.prompt, /Use \$qc-flow/);
  assert.doesNotMatch(payload.prompt, /Use \$qc-lock/);
});

test("wrap prompt consumes Experience Engine route-task verdict when available", async () => {
  const router = await startFakeExperienceRouter(process.cwd(), {
    routeTaskResponses: [{
      route: "qc-lock",
      confidence: 0.91,
      source: "brain",
      reason: "The task is narrow enough for locked execution."
    }],
    routeModelResponses: []
  });
  try {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-brain-"));
    const result = runWrapCliWithEnv(projectDir, {
      QUICK_CODEX_EXPERIENCE_URL: router.baseUrl,
      QUICK_CODEX_WRAP_ENABLE_TASK_ROUTER: "1"
    }, "prompt", "--dir", projectDir, "--task", "build a thin wrapper before Codex CLI that auto-routes tasks, planning flow, and manual continuation steps", "--json");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.route, "qc-lock");
    assert.equal(payload.routeSource, "brain");
    assert.equal(payload.promptSource, "experience-task-router");
    assert.match(payload.prompt, /Use \$qc-lock/);
    const requests = fs.readFileSync(router.requestsPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(requests.some((entry) => entry.url === "/api/route-task"), true);
  } finally {
    await router.close();
  }
});

test("wrap prompt enables Experience routing from ~/.experience config without requiring routing=true", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-config-"));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-exp-config-"));
  const homeDir = path.join(configDir, "home");
  fs.mkdirSync(path.join(homeDir, ".experience"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".experience", "config.json"), JSON.stringify({
    serverBaseUrl: "http://127.0.0.1:9",
    serverAuthToken: "token-without-routing-flag"
  }, null, 2), "utf8");
  const result = runWrapCliWithEnv(projectDir, {
    HOME: homeDir,
    QUICK_CODEX_WRAP_TASK_ROUTER_TIMEOUT_MS: "50"
  }, "prompt", "--dir", projectDir, "--task", "build a thin wrapper before Codex CLI that auto-routes tasks, planning flow, and manual continuation steps", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.routeSource, "heuristic-fallback");
  assert.equal(payload.taskRouting.enabled, true);
  assert.equal(payload.taskRouting.applied, false);
});

test("wrap prompt falls back to heuristic routing when Experience Engine route-task is unavailable", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-route-fallback-"));
  const result = runWrapCliWithEnv(projectDir, {
    QUICK_CODEX_EXPERIENCE_URL: "http://127.0.0.1:9",
    QUICK_CODEX_WRAP_ENABLE_TASK_ROUTER: "1",
    QUICK_CODEX_WRAP_TASK_ROUTER_TIMEOUT_MS: "50"
  }, "prompt", "--dir", projectDir, "--task", "build a thin wrapper before Codex CLI that auto-routes tasks, planning flow, and manual continuation steps", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-flow");
  assert.equal(payload.routeSource, "heuristic-fallback");
  assert.equal(payload.promptSource, "task-router");
  assert.match(payload.prompt, /Use \$qc-flow/);
});

test("wrap prompt surfaces disambiguation when Experience Engine route-task requests it", async () => {
  const router = await startFakeExperienceRouter(process.cwd(), {
    routeTaskResponses: [{
      needs_disambiguation: true,
      confidence: 0.42,
      source: "brain",
      reason: "The task could reasonably mean planning, explanation, or a narrow implementation.",
      options: [
        {
          id: "plan",
          label: "Plan before coding",
          route: "qc-flow",
          description: "Clarify the intent and inspect the repo before implementation."
        },
        {
          id: "direct",
          label: "Explain only",
          route: "direct",
          description: "Answer without opening workflow state."
        }
      ]
    }],
    routeModelResponses: []
  });
  try {
    const projectDir = process.cwd();
    const result = runWrapCliWithEnv(projectDir, {
      QUICK_CODEX_EXPERIENCE_URL: router.baseUrl,
      QUICK_CODEX_WRAP_ENABLE_TASK_ROUTER: "1"
    }, "prompt", "--task", "make the wrapper better", "--json");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.needsDisambiguation, true);
    assert.equal(payload.promptSource, "needs-disambiguation");
    assert.equal(payload.routeSource, "brain");
    assert.equal(Array.isArray(payload.options), true);
    assert.equal(payload.options.length >= 2, true);
  } finally {
    await router.close();
  }
});

test("wrap decide prefers next-wave pack payload for same-phase routing", () => {
  const project = makeProject(routedWaveRun);
  const result = runWrapCli(project.dir, "decide", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.phaseRelation, "same-phase");
  assert.equal(payload.mode, "fresh-session");
  assert.equal(payload.promptSource, "next-wave-pack");
  assert.match(payload.prompt, /review and execute P1 \/ W2/);
});

test("wrap decide keeps independent-next-phase on a fresh session", () => {
  const independentRun = baseRun
    .replaceAll("- Phase relation: same-phase", "- Phase relation: independent-next-phase")
    .replace("- Suggested session action: `/compact` after reviewing this summary and resume payload.", "- Suggested session action: `/clear` only after this summary is recorded and the next phase is confirmed independent.")
    .replace("- Next target: resume P1 / W1", "- Next target: P2 / W1")
    .replace("- Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample.md.`", "- Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample.md to start P2 / W1 after the independent reset.`");
  const project = makeProject(independentRun);
  const result = runWrapCli(project.dir, "decide", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.phaseRelation, "independent-next-phase");
  assert.equal(payload.mode, "fresh-session");
  assert.equal(payload.nativeThreadAction, "thread/start");
  assert.equal(payload.chatActionEquivalent, null);
  assert.equal(payload.handoffAction, "clear-session");
  assert.match(payload.prompt, /start P2 \/ W1 after the independent reset/);
});

test("wrap decide exposes compact-oriented orchestration fields for same-phase fresh sessions", () => {
  const project = makeProject(routedWaveRun);
  const result = runWrapCli(project.dir, "decide", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.sessionStrategy, "fresh-session");
  assert.equal(payload.chatActionEquivalent, "/compact");
  assert.equal(payload.handoffAction, "compact-session");
  assert.equal(payload.wrapperCommandEquivalent, "start");
});

test("wrap decide exposes a native compact action when the wrapper already knows the thread id", () => {
  const project = makeProject(routedWaveRun);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const result = runWrapCli(project.dir, "decide", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.nativeThreadAction, "thread/compact/start");
  assert.equal(payload.chatActionEquivalent, "/compact");
});

test("wrap start dry-run prints a codex exec command and writes wrapper state", () => {
  const project = makeProject(routedWaveRun);
  const result = runWrapCli(project.dir, "start", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.deepEqual(payload.command.slice(0, 2), ["codex", "exec"]);
  const statePath = path.join(project.dir, ".quick-codex-flow", "wrapper-state.json");
  assert.equal(fs.existsSync(statePath), true);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.equal(typeof state.runs[".quick-codex-flow/sample.md"].lastPrompt, "string");
});

test("wrap continue can resume an existing exec session when same-session is requested", () => {
  const project = makeProject(routedWaveRun);
  writeStateFile(project.dir, `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- execute

Current phase / wave:
- P1 / W2

Execution mode:
- manual

Status:
- active
`);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastExecSessionId: "123e4567-e89b-42d3-a456-426614174000",
        lastPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const result = runWrapCli(project.dir, "continue", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--same-session", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.adapter, "exec");
  assert.equal(payload.nativeThreadAction, null);
  assert.deepEqual(payload.command.slice(0, 4), ["codex", "exec", "resume", "123e4567-e89b-42d3-a456-426614174000"]);
});

test("wrap continue can resume an existing native thread when same-session is requested", () => {
  const project = makeProject(routedWaveRun);
  writeStateFile(project.dir, `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- execute

Current phase / wave:
- P1 / W2

Execution mode:
- manual

Status:
- active
`);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const result = runWrapCli(project.dir, "continue", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--same-session", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.adapter, "app-server");
  assert.equal(payload.nativeThreadAction, "thread/resume");
  assert.equal(payload.threadId, "123e4567-e89b-42d3-a456-426614174999");
});

test("wrap auto can resume an existing exec session without manual command selection", () => {
  const project = makeProject(routedWaveRun);
  writeStateFile(project.dir, `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- execute

Current phase / wave:
- P1 / W2

Execution mode:
- manual

Status:
- active
`);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastExecSessionId: "123e4567-e89b-42d3-a456-426614174000",
        lastPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const result = runWrapCli(project.dir, "auto", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, "resume-session");
  assert.equal(payload.nativeThreadAction, null);
  assert.equal(payload.chatActionEquivalent, null);
  assert.equal(payload.handoffAction, "resume-session");
  assert.deepEqual(payload.command.slice(0, 4), ["codex", "exec", "resume", "123e4567-e89b-42d3-a456-426614174000"]);
});

test("wrap start uses the native app-server clear path for independent-next-phase runs", () => {
  const independentRun = baseRun
    .replaceAll("Phase relation: same-phase", "Phase relation: independent-next-phase")
    .replace("Suggested session action: `/compact` after reviewing this summary and resume payload.", "Suggested session action: `/clear` only after this summary is recorded and the next phase is confirmed independent.")
    .replace("Next target: resume P1 / W1", "Next target: P2 / W1")
    .replace("Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample.md.`", "Resume payload: `Reply with native clear path reached.`");
  const project = makeProject(independentRun);
  const fakeAppServer = makeFakeAppServer(project.dir, {
    finalText: "native clear path reached"
  });
  const lastMessagePath = path.join(project.dir, "last-message.txt");
  const result = runWrapCliWithEnv(project.dir, fakeAppServer.env, "start", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--json", "--output-last-message", lastMessagePath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.adapter, "app-server");
  assert.equal(payload.nativeThreadAction, "thread/start");
  assert.equal(payload.threadId, "123e4567-e89b-42d3-a456-426614174999");
  assert.equal(fs.readFileSync(lastMessagePath, "utf8").trim(), "native clear path reached");
  const state = JSON.parse(fs.readFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), "utf8"));
  assert.equal(state.runs[".quick-codex-flow/sample.md"].lastNativeThreadId, "123e4567-e89b-42d3-a456-426614174999");
});

test("wrap start uses the native app-server compact path for same-phase runs when a thread id is available", () => {
  const project = makeProject(routedWaveRun);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const fakeAppServer = makeFakeAppServer(project.dir, {
    finalText: "native compact path reached"
  });
  const lastMessagePath = path.join(project.dir, "last-message-compact.txt");
  const result = runWrapCliWithEnv(project.dir, fakeAppServer.env, "start", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--json", "--output-last-message", lastMessagePath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.adapter, "app-server");
  assert.equal(payload.nativeThreadAction, "thread/compact/start");
  assert.equal(payload.threadId, "123e4567-e89b-42d3-a456-426614174999");
  assert.equal(fs.readFileSync(lastMessagePath, "utf8").trim(), "native compact path reached");
});

test("wrap run dry-run launches the task-router prompt through codex exec", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-wrap-run-dry-"));
  const result = runWrapCli(projectDir, "run", "--dir", projectDir, "--task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.deepEqual(payload.command.slice(0, 2), ["codex", "exec"]);
  assert.match(payload.prompt, /Use \$qc-lock/);
});

test("wrap run dry-run consumes Experience Engine route-model and forwards -m to codex exec", async () => {
  const projectDir = process.cwd();
  const fakeRouter = await startFakeExperienceRouter(projectDir, {
    routeModelResponses: [{
      taskHash: "route-hash-fast",
      tier: "fast",
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
      confidence: 0.82,
      source: "history",
      reason: "similar narrow fix succeeded on fast"
    }]
  });
  try {
    const result = runWrapCliWithEnv(projectDir, {
      QUICK_CODEX_EXPERIENCE_URL: fakeRouter.baseUrl,
      QUICK_CODEX_WRAP_ENABLE_MODEL_ROUTER: "1"
    }, "run", "--dir", projectDir, "--task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--dry-run", "--json");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.model, "gpt-5.4-mini");
    assert.equal(payload.reasoningEffort, "low");
    assert.equal(payload.modelRouting.tier, "fast");
    assert.equal(payload.modelRouting.source, "history");
    assert.equal(payload.routeFeedback.sent, false);
    const modelIndex = payload.command.indexOf("-m");
    assert.notEqual(modelIndex, -1);
    assert.equal(payload.command[modelIndex + 1], "gpt-5.4-mini");
    assert.equal(payload.command.includes('-c'), true);
    assert.equal(payload.command.includes('model_reasoning_effort="low"'), true);
    const requests = fs.readFileSync(fakeRouter.requestsPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(requests.some((entry) => entry.url === "/api/route-model"), true);
    assert.equal(requests.filter((entry) => entry.url === "/api/route-feedback").length, 0);
  } finally {
    await fakeRouter.close();
  }
});

test("wrap run dry-run gives broad qc-flow tasks a longer model-router timeout budget", async () => {
  const projectDir = process.cwd();
  const fakeRouter = await startFakeExperienceRouter(projectDir, {
    routeModelResponses: [{
      taskHash: "route-hash-premium",
      tier: "premium",
      model: "gpt-5.4",
      reasoningEffort: "high",
      confidence: 0.79,
      source: "brain",
      reason: "broad planning task needs the premium Codex tier"
    }],
    routeModelDelayMs: 4500
  });
  try {
    const result = runWrapCliWithEnv(projectDir, {
      QUICK_CODEX_EXPERIENCE_URL: fakeRouter.baseUrl,
      QUICK_CODEX_WRAP_ENABLE_MODEL_ROUTER: "1"
    }, "run", "--dir", projectDir, "--task", "design anti-bot architecture for Storyflow across multiple files and phases", "--dry-run", "--json");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.route, "qc-flow");
    assert.equal(payload.model, "gpt-5.4");
    assert.equal(payload.reasoningEffort, "high");
    assert.equal(payload.modelRouting.applied, true);
    assert.equal(payload.modelRouting.source, "brain");
  } finally {
    await fakeRouter.close();
  }
});

test("wrap run dry-run forwards explicit full permission policy to codex exec", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-policy-exec-"));
  const result = runWrapCli(projectDir, "run", "--dir", projectDir, "--task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--permission-profile", "full", "--approval-mode", "never", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.permissionProfile, "full");
  assert.equal(payload.approvalPolicy, "never");
  assert.equal(payload.sandboxMode, "danger-full-access");
  assert.match(payload.command.join(" "), /approval_policy=\"never\"/);
  assert.match(payload.command.join(" "), /--sandbox danger-full-access/);
});

test("wrap start dry-run forwards yolo policy to the app-server adapter", () => {
  const project = makeProject(baseRun);
  const result = runWrapCli(project.dir, "start", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--permission-profile", "yolo", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.permissionProfile, "yolo");
  assert.equal(payload.bypassApprovalsAndSandbox, true);
  assert.match(payload.command.join(" "), /--dangerously-bypass-approvals-and-sandbox/);
});

test("wrap auto dry-run picks repo-level wrapper permission defaults when no explicit flags are present", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-policy-config-"));
  fs.mkdirSync(path.join(projectDir, ".quick-codex-flow"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, ".quick-codex-flow", "wrapper-config.json"), `${JSON.stringify({
    version: 1,
    defaults: {
      permissionProfile: "readonly",
      approvalMode: "never",
      executionProfile: "follow-safe",
      chat: {
        follow: true,
        maxTurns: 7
      }
    }
  }, null, 2)}\n`, "utf8");
  const result = runWrapCli(projectDir, "auto", "--dir", projectDir, "--task", "explain how the wrapper state file works", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.permissionProfile, "readonly");
  assert.equal(payload.approvalPolicy, "never");
  assert.equal(payload.sandboxMode, "read-only");
});

test("wrap start posts route-feedback after a routed exec turn", async () => {
  const project = makeProject(baseRun);
  const fakeRouter = await startFakeExperienceRouter(project.dir, {
    routeModelResponses: [{
      taskHash: "route-hash-balanced",
      tier: "balanced",
      model: "gpt-5.2",
      confidence: 0.74,
      source: "brain",
      reason: "moderate implementation task"
    }]
  });
  try {
    const fakeCodex = makeFakeCodex(project.dir, []);
    const lastMessagePath = path.join(project.dir, "last-message-router.txt");
    const result = runWrapCliWithEnv(project.dir, {
      ...fakeCodex.env,
      QUICK_CODEX_EXPERIENCE_URL: fakeRouter.baseUrl,
      QUICK_CODEX_WRAP_ENABLE_MODEL_ROUTER: "1"
    }, "start", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--json", "--output-last-message", lastMessagePath);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    const argv = JSON.parse(fs.readFileSync(fakeCodex.argvPath, "utf8"));
    assert.equal(argv[0], "exec");
    const modelIndex = argv.indexOf("-m");
    assert.notEqual(modelIndex, -1);
    assert.equal(argv[modelIndex + 1], "gpt-5.2");
    assert.notEqual(argv.indexOf("--skip-git-repo-check"), -1);
    assert.equal(payload.model, "gpt-5.2");
    assert.equal(payload.routeFeedback.sent, true);
    const requests = fs.readFileSync(fakeRouter.requestsPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const feedback = requests.find((entry) => entry.url === "/api/route-feedback");
    assert.ok(feedback, "expected route-feedback request");
    assert.equal(feedback.body.taskHash, "route-hash-balanced");
    assert.equal(feedback.body.model, "gpt-5.2");
    assert.equal(feedback.body.outcome, "success");
  } finally {
    await fakeRouter.close();
  }
});

test("wrap auto dry-run launches a raw task through the same routed path", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-auto-dry-"));
  const result = runWrapCli(projectDir, "auto", "--dir", projectDir, "--task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.equal(payload.sessionStrategy, "fresh-session");
  assert.equal(payload.handoffAction, "launch-task");
  assert.equal(payload.wrapperCommandEquivalent, "run");
  assert.deepEqual(payload.command.slice(0, 2), ["codex", "exec"]);
});

test("wrap auto --follow continues across checkpoint advances until the artifact is done", () => {
  const stage1 = flowArtifact({
    phaseWave: "P1 / W1",
    nextPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md to review and execute P1 / W2."
  });
  const stage2 = flowArtifact({
    phaseWave: "P1 / W2",
    nextPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md to review and execute P1 / W3."
  });
  const stage3 = flowArtifact({
    phaseWave: "P1 / W3",
    nextPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md to close the run.",
    gate: "done",
    executionState: "done"
  });
  const project = makeProject(stage1);
  const stateActive = `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`;
  const stateDone = `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- done

Current phase / wave:
- P1 / W3

Execution mode:
- manual

Status:
- done
`;
  writeStateFile(project.dir, stateActive);
  const fakeCodex = makeFakeCodex(project.dir, [
    { artifact: stage2, state: stateActive.replace("P1 / W1", "P1 / W2") },
    { artifact: stage3, state: stateDone }
  ]);
  const result = runWrapCliWithEnv(project.dir, fakeCodex.env, "auto", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--follow", "--max-turns", "3", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.followRequested, true);
  assert.equal(payload.turnsExecuted, 2);
  assert.equal(payload.stoppedBecause, "completed");
  assert.equal(payload.turns.length, 2);
});

test("wrap auto --follow stops when the artifact exposes a blocker", () => {
  const stage1 = flowArtifact({
    phaseWave: "P1 / W1",
    nextPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md to review and execute P1 / W2."
  });
  const blockedStage = flowArtifact({
    phaseWave: "P1 / W2",
    nextPrompt: "Use $qc-flow and resume from .quick-codex-flow/sample.md after the blocker is resolved.",
    blockers: ["waiting on API contract clarification"]
  });
  const project = makeProject(stage1);
  const stateActive = `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`;
  writeStateFile(project.dir, stateActive);
  const fakeCodex = makeFakeCodex(project.dir, [
    { artifact: blockedStage, state: stateActive.replace("P1 / W1", "P1 / W2") }
  ]);
  const result = runWrapCliWithEnv(project.dir, fakeCodex.env, "auto", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--follow", "--max-turns", "3", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.followRequested, true);
  assert.equal(payload.turnsExecuted, 1);
  assert.equal(payload.stoppedBecause, "blocker");
});

test("wrap auto --follow uses native compact by default when same-phase continuity already has a thread id", () => {
  const stage1 = flowArtifact({
    phaseWave: "P1 / W1",
    nextPrompt: "Reply with NATIVE_FOLLOW_W1 only."
  });
  const stage2 = flowArtifact({
    phaseWave: "P1 / W2",
    nextPrompt: "Reply with NATIVE_FOLLOW_W2 only."
  });
  const stage3 = flowArtifact({
    phaseWave: "P1 / W3",
    nextPrompt: "Reply with NATIVE_FOLLOW_DONE only.",
    gate: "done",
    executionState: "done"
  });
  const project = makeProject(stage1);
  const stateW1 = `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`;
  const stateW2 = stateW1.replace("P1 / W1", "P1 / W2");
  const stateDone = `# Quick Codex Flow State

Active run:
- .quick-codex-flow/sample.md

Current gate:
- done

Current phase / wave:
- P1 / W3

Execution mode:
- manual

Status:
- done
`;
  writeStateFile(project.dir, stateW1);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Reply with NATIVE_FOLLOW_W1 only.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const fakeAppServer = makeFakeAppServer(project.dir, {
    finalText: "native follow compact turn",
    stages: [
      { artifact: stage2, state: stateW2 },
      { artifact: stage3, state: stateDone }
    ]
  });
  const result = runWrapCliWithEnv(project.dir, fakeAppServer.env, "auto", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--follow", "--max-turns", "3", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.followRequested, true);
  assert.equal(payload.turnsExecuted, 2);
  assert.equal(payload.stoppedBecause, "completed");
  assert.equal(payload.turns.length, 2);
  assert.equal(payload.turns[0].adapter, "app-server");
  assert.equal(payload.turns[0].nativeThreadAction, "thread/compact/start");
  assert.equal(payload.turns[1].adapter, "app-server");
  assert.equal(payload.turns[1].nativeThreadAction, "thread/compact/start");
  assert.equal(payload.turns[0].threadId, "123e4567-e89b-42d3-a456-426614174999");
});

test("wrap auto --follow reuses one persistent app-server process across compacted turns", () => {
  const stage1 = flowArtifact({
    phaseWave: "P1 / W1",
    nextPrompt: "Reply with NATIVE_PERSIST_W1 only."
  });
  const stage2 = flowArtifact({
    phaseWave: "P1 / W2",
    nextPrompt: "Reply with NATIVE_PERSIST_W2 only."
  });
  const stage3 = flowArtifact({
    phaseWave: "P1 / W3",
    nextPrompt: "Reply with NATIVE_PERSIST_DONE only.",
    gate: "done",
    executionState: "done"
  });
  const project = makeProject(stage1);
  const stateW1 = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- execute\n\nCurrent phase / wave:\n- P1 / W1\n\nExecution mode:\n- manual\n\nStatus:\n- active\n`;
  const stateW2 = stateW1.replace("P1 / W1", "P1 / W2");
  const stateDone = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- done\n\nCurrent phase / wave:\n- P1 / W3\n\nExecution mode:\n- manual\n\nStatus:\n- done\n`;
  writeStateFile(project.dir, stateW1);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Reply with NATIVE_PERSIST_W1 only.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const fakeAppServer = makeFakeAppServer(project.dir, {
    finalText: "native persistent compact turn",
    stages: [
      { artifact: stage2, state: stateW2 },
      { artifact: stage3, state: stateDone }
    ]
  });
  const result = runWrapCliWithEnv(project.dir, fakeAppServer.env, "auto", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--follow", "--max-turns", "3", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.stoppedBecause, "completed");
  assert.equal(fs.readFileSync(fakeAppServer.startupCountPath, "utf8").trim(), "1");
});

test("wrap auto --follow restarts the persistent app-server when the routed model changes", async () => {
  const stage1 = flowArtifact({
    phaseWave: "P1 / W1",
    nextPrompt: "Reply with MODEL_ROTATE_W1 only."
  });
  const stage2 = flowArtifact({
    phaseWave: "P1 / W2",
    nextPrompt: "Reply with MODEL_ROTATE_W2 only."
  });
  const stage3 = flowArtifact({
    phaseWave: "P1 / W3",
    nextPrompt: "Reply with MODEL_ROTATE_DONE only.",
    gate: "done",
    executionState: "done"
  });
  const project = makeProject(stage1);
  const stateW1 = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- execute\n\nCurrent phase / wave:\n- P1 / W1\n\nExecution mode:\n- manual\n\nStatus:\n- active\n`;
  const stateW2 = stateW1.replace("P1 / W1", "P1 / W2");
  const stateDone = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- done\n\nCurrent phase / wave:\n- P1 / W3\n\nExecution mode:\n- manual\n\nStatus:\n- done\n`;
  writeStateFile(project.dir, stateW1);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Reply with MODEL_ROTATE_W1 only.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const fakeAppServer = makeFakeAppServer(project.dir, {
    finalText: "native rotated compact turn",
    stages: [
      { artifact: stage2, state: stateW2 },
      { artifact: stage3, state: stateDone }
    ]
  });

  const fakeRouter = await startFakeExperienceRouter(project.dir, {
    routeModelResponses: [
      {
        taskHash: "rotate-hash-1",
        tier: "balanced",
        model: "gpt-5.2",
        confidence: 0.7,
        source: "brain",
        reason: "follow-loop routing test"
      },
      {
        taskHash: "rotate-hash-2",
        tier: "premium",
        model: "gpt-5.4",
        confidence: 0.7,
        source: "brain",
        reason: "follow-loop routing test"
      }
    ]
  });
  try {
    const result = runWrapCliWithEnv(project.dir, {
      ...fakeAppServer.env,
      QUICK_CODEX_EXPERIENCE_URL: fakeRouter.baseUrl,
      QUICK_CODEX_WRAP_ENABLE_MODEL_ROUTER: "1"
    }, "auto", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--follow", "--max-turns", "3", "--json");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.stoppedBecause, "completed");
    assert.equal(payload.turns.length, 2);
    assert.equal(fs.readFileSync(fakeAppServer.startupCountPath, "utf8").trim(), "2");
    const argvLines = fs.readFileSync(fakeAppServer.argvPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.notEqual(argvLines[0].indexOf("-m"), -1);
    assert.equal(argvLines[0][argvLines[0].indexOf("-m") + 1], "gpt-5.2");
    assert.notEqual(argvLines[1].indexOf("-m"), -1);
    assert.equal(argvLines[1][argvLines[1].indexOf("-m") + 1], "gpt-5.4");
  } finally {
    await fakeRouter.close();
  }
});

test("codex shim routes --qc-auto into quick-codex-wrap", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-route-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-auto", "--dir", projectDir, "--task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.equal(payload.handoffAction, "launch-task");
});

test("codex shim routes a plain prompt into the default follow-safe wrapper profile", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-default-prompt-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--qc-dir", projectDir, "--qc-json", "--qc-dry-run");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.equal(payload.followRequested, true);
  assert.equal(payload.stoppedBecause, "dry-run");
  assert.ok(payload.trace, "expected response.trace contract");
  assert.ok(payload.final, "expected response.final contract");
});

test("codex shim bypass flag sends a plain prompt to the real codex binary", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-bypass-"));
  const fakeRealCodex = path.join(projectDir, "real-codex.mjs");
  const argvPath = path.join(projectDir, "real-codex-argv.json");
  fs.writeFileSync(fakeRealCodex, `#!/usr/bin/env node
import fs from "node:fs";
fs.writeFileSync(process.env.FAKE_REAL_CODEX_ARGV, JSON.stringify(process.argv.slice(2), null, 2), "utf8");
`, "utf8");
  fs.chmodSync(fakeRealCodex, 0o755);
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: fakeRealCodex,
    FAKE_REAL_CODEX_ARGV: argvPath
  }, "--qc-bypass", "fix the wrapper follow loop");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const argv = JSON.parse(fs.readFileSync(argvPath, "utf8"));
  assert.deepEqual(argv, ["fix the wrapper follow loop"]);
});

test("codex shim supports qc-profile aliases for wrapper options", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-alias-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-auto", "--qc-dir", projectDir, "--qc-task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--qc-dry-run", "--qc-json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.equal(payload.dryRun, true);
  assert.equal(payload.handoffAction, "launch-task");
});

test("codex shim fast preset defaults to run/start style execution without follow state", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-fast-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-fast", "--qc-dir", projectDir, "--qc-task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--qc-dry-run", "--qc-json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "followRequested"), false);
});

test("codex shim safe preset defaults to auto orchestration without follow", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-safe-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-safe", "--qc-dir", projectDir, "--qc-task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--qc-dry-run", "--qc-json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.equal(payload.followRequested, false);
  assert.equal(payload.turnsExecuted, 1);
  assert.equal(payload.permissionProfile, "safe");
  assert.equal(payload.approvalPolicy, "on-request");
});

test("codex shim forwards full permission and autonomous approval overlays", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-full-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-auto", "--qc-full", "--qc-autonomous", "--qc-dir", projectDir, "--qc-task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--qc-dry-run", "--qc-json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.permissionProfile, "full");
  assert.equal(payload.approvalPolicy, "never");
  assert.equal(payload.sandboxMode, "danger-full-access");
});

test("codex shim treats qc-only permission overlays as wrapper auto mode by default", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-perm-default-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-full", "--qc-autonomous", "--qc-dir", projectDir, "--qc-task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--qc-dry-run", "--qc-json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-lock");
  assert.equal(payload.permissionProfile, "full");
  assert.equal(payload.approvalPolicy, "never");
  assert.equal(payload.sandboxMode, "danger-full-access");
});

test("codex shim supports qc-follow profile flags end-to-end", () => {
  const stage1 = flowArtifact({
    phaseWave: "P1 / W1",
    nextPrompt: "Reply with SHIM_ALIAS_W1 only."
  });
  const stage2 = flowArtifact({
    phaseWave: "P1 / W2",
    nextPrompt: "Reply with SHIM_ALIAS_W2 only.",
    gate: "done",
    executionState: "done"
  });
  const project = makeProject(stage1);
  const stateW1 = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- execute\n\nCurrent phase / wave:\n- P1 / W1\n\nExecution mode:\n- manual\n\nStatus:\n- active\n`;
  const stateDone = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- done\n\nCurrent phase / wave:\n- P1 / W2\n\nExecution mode:\n- manual\n\nStatus:\n- done\n`;
  writeStateFile(project.dir, stateW1);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Reply with SHIM_ALIAS_W1 only.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const fakeAppServer = makeFakeAppServer(project.dir, {
    finalText: "shim alias compact follow",
    stages: [
      { artifact: stage2, state: stateDone }
    ]
  });
  const result = runCodexShimWithEnv(project.dir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath,
    ...fakeAppServer.env
  }, "--qc-auto", "--qc-dir", project.dir, "--qc-run-file", ".quick-codex-flow/sample.md", "--qc-follow", "--qc-max-turns", "2", "--qc-json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.followRequested, true);
  assert.equal(payload.turnsExecuted, 1);
  assert.equal(payload.stoppedBecause, "completed");
  assert.equal(payload.turns[0].nativeThreadAction, "thread/compact/start");
});

test("codex shim follow-safe preset defaults to auto follow with max-turns policy", () => {
  const stage1 = flowArtifact({
    phaseWave: "P1 / W1",
    nextPrompt: "Reply with SHIM_PROFILE_W1 only."
  });
  const stage2 = flowArtifact({
    phaseWave: "P1 / W2",
    nextPrompt: "Reply with SHIM_PROFILE_W2 only.",
    gate: "done",
    executionState: "done"
  });
  const project = makeProject(stage1);
  const stateW1 = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- execute\n\nCurrent phase / wave:\n- P1 / W1\n\nExecution mode:\n- manual\n\nStatus:\n- active\n`;
  const stateDone = `# Quick Codex Flow State\n\nActive run:\n- .quick-codex-flow/sample.md\n\nCurrent gate:\n- done\n\nCurrent phase / wave:\n- P1 / W2\n\nExecution mode:\n- manual\n\nStatus:\n- done\n`;
  writeStateFile(project.dir, stateW1);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "wrapper-state.json"), `${JSON.stringify({
    version: 1,
    runs: {
      ".quick-codex-flow/sample.md": {
        lastMode: "fresh-session",
        lastNativeThreadId: "123e4567-e89b-42d3-a456-426614174999",
        lastPrompt: "Reply with SHIM_PROFILE_W1 only.",
        updatedAt: "2026-04-17T00:00:00.000Z"
      }
    }
  }, null, 2)}\n`, "utf8");
  const fakeAppServer = makeFakeAppServer(project.dir, {
    finalText: "shim profile compact follow",
    stages: [
      { artifact: stage2, state: stateDone }
    ]
  });
  const result = runCodexShimWithEnv(project.dir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath,
    ...fakeAppServer.env
  }, "--qc-follow-safe", "--qc-dir", project.dir, "--qc-run-file", ".quick-codex-flow/sample.md", "--qc-json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.followRequested, true);
  assert.equal(payload.turnsExecuted, 1);
  assert.equal(payload.stoppedBecause, "completed");
  assert.equal(payload.turns[0].nativeThreadAction, "thread/compact/start");
});

test("codex shim prints qc help locally", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-help-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-help");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Quick Codex shim help/);
  assert.match(result.stdout, /--qc-fast/);
  assert.match(result.stdout, /--qc-follow-safe/);
  assert.match(result.stdout, /--qc-force-flow/);
  assert.match(result.stdout, /--qc-force-direct/);
  assert.match(result.stdout, /--qc-task <text>/);
  assert.match(result.stdout, /--qc-ui <auto\|plain\|rich\|native>/);
  assert.match(result.stdout, /--qc-native-guarded-slash <\/status\|\/compact\|\/clear\|\/resume <session-id-or-name\|--last>>/);
});

test("codex shim forwards guarded native slash aliases to the wrapper", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-native-guarded-"));
  const fakeNative = makeFakeGuardedSlashNativeBridge(projectDir);
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath,
    ...fakeNative.env
  }, "--qc-chat", "--qc-dir", projectDir, "--qc-ui", "native", "--qc-native-guarded-slash", "/status");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/status \| kind=proof \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/status\n");
});

test("codex shim forwards guarded native /compact aliases to the wrapper", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-native-compact-"));
  const fakeNative = makeFakeGuardedCompactNativeBridge(projectDir);
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath,
    ...fakeNative.env
  }, "--qc-chat", "--qc-dir", projectDir, "--qc-ui", "native", "--qc-native-guarded-slash", "/compact");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/compact \| kind=continuity \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/compact\n");
});

test("codex shim forwards guarded native /clear aliases to the wrapper", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-native-clear-"));
  const fakeNative = makeFakeGuardedClearNativeBridge(projectDir);
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath,
    ...fakeNative.env
  }, "--qc-chat", "--qc-dir", projectDir, "--qc-ui", "native", "--qc-native-guarded-slash", "/clear");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/clear \| kind=continuity \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/clear\n");
});

test("codex shim forwards guarded native /resume aliases to the wrapper", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-native-guarded-resume-"));
  const fakeNative = makeFakeGuardedResumeNativeBridge(projectDir);
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath,
    ...fakeNative.env
  }, "--qc-chat", "--qc-dir", projectDir, "--qc-ui", "native", "--qc-native-guarded-slash", "/resume my-saved-thread");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/resume my-saved-thread \| kind=continuity \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/resume my-saved-thread\n");
});

test("codex shim forwards manual route overrides to the wrapper", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-force-route-"));
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_WRAP_BIN: path.join(process.cwd(), "bin", "quick-codex-wrap.js"),
    QUICK_CODEX_REAL_CODEX_BIN: process.execPath
  }, "--qc-force-direct", "--qc-task", "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug", "--qc-json", "--qc-dry-run");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "direct");
  assert.equal(payload.routeSource, "manual-route-override");
  assert.match(payload.prompt, /^Wrapper route: direct/m);
});

test("interactive wrapper shell exits cleanly after processing a piped message", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-shell-"));
  const fakeCodex = makeFakeCodex(projectDir, []);
  const result = runWrapCliWithInputAndEnv(projectDir, {
    ...fakeCodex.env
  }, "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug\n/exit\n", "chat", "--dir", projectDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Quick Codex interactive shell/);
  assert.match(result.stdout, /\[wrapper\] route=qc-lock/);
  assert.match(result.stdout, /fake codex assistant reply/);
});

test("interactive wrapper shell supports experimental native ui bridge", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-native-"));
  const fakeNative = makeFakeNativeBridge(projectDir);
  const startupTask = "Say exactly NATIVE_STARTUP_PROMPT_OK";
  const result = runWrapCliWithEnv(projectDir, {
    ...fakeNative.env
  }, "chat", "--dir", projectDir, "--ui", "native", "--task", startupTask);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] launching experimental native Codex bridge/);
  assert.match(result.stdout, /\[wrapper\] native-bridge=ready/);
  assert.match(result.stdout, /FAKE_NATIVE_CODEX_OK/);

  const appServerArgv = JSON.parse(fs.readFileSync(fakeNative.appServerArgvPath, "utf8"));
  const codexArgv = JSON.parse(fs.readFileSync(fakeNative.codexArgvPath, "utf8"));
  assert.match(appServerArgv.join(" "), /--listen ws:\/\/127\.0\.0\.1:/);
  assert.match(codexArgv.join(" "), /--remote ws:\/\/127\.0\.0\.1:/);
  assert.match(codexArgv.join(" "), /--no-alt-screen/);
  assert.match(codexArgv.join(" "), /Say exactly NATIVE_STARTUP_PROMPT_OK/);
});

test("native session observer detects busy, prompt-ready, and turn-settled signals", () => {
  const observer = new NativeSessionObserver();
  observer.ingestChunk("stdout", "\u001b[2mWorking\u001b[22m (1s)\n");
  observer.ingestChunk("stdout", "› waiting for next input\n");
  observer.ingestChunk("stdout", "To continue this session, run codex resume 019d9b43-1163-77f1-92f8-f51d1d19daf9\n");

  assert.equal(observer.snapshot.busy, false);
  assert.equal(observer.snapshot.promptReady, true);
  assert.equal(observer.snapshot.turnSettled, true);
  assert.equal(observer.snapshot.sessionId, "019d9b43-1163-77f1-92f8-f51d1d19daf9");
  assert.equal(observer.events.some((entry) => entry.type === "native-busy"), true);
  assert.equal(observer.events.some((entry) => entry.type === "prompt-ready"), true);
  assert.equal(observer.events.some((entry) => entry.type === "turn-settled"), true);
});

test("native session observer does not mark prompt-ready when startup busy output contains the prompt glyph", () => {
  const observer = new NativeSessionObserver();
  observer.ingestChunk(
    "stdout",
    "• Booting MCP server: context7 (0s • esc to interrupt)\n› Summarize recent commits\n"
  );

  assert.equal(observer.snapshot.busy, true);
  assert.equal(observer.snapshot.promptReady, false);
  assert.equal(observer.events.some((entry) => entry.type === "native-busy"), true);
  assert.equal(observer.events.some((entry) => entry.type === "prompt-ready"), false);
});

test("native session observer does not treat the OpenAI Codex startup banner as a prompt-ready marker", () => {
  const observer = new NativeSessionObserver();
  observer.ingestChunk("stdout", "╭────────────────────────────────────────────╮");
  observer.ingestChunk("stdout", "│ >_ OpenAI Codex (v0.121.0)                 │");
  observer.ingestChunk("stdout", "│ model:     gpt-5.4 high   /model to change │");
  observer.ingestChunk("stdout", "│ directory: /mnt/d/Personal/Core            │");
  observer.ingestChunk("stdout", "╰────────────────────────────────────────────╯");

  assert.equal(observer.events.some((entry) => entry.type === "prompt-ready"), false);
});

test("native session controller only sends input when stdin is controllable", async () => {
  const chunks = [];
  const controller = new NativeSessionController({
    stdin: {
      destroyed: false,
      write(value) {
        chunks.push(value);
      }
    },
    mode: "pipe"
  });
  controller.sendText("hello");
  controller.sendSlashCommand("/compact");
  assert.equal(chunks.join(""), "hello\n/compact\n");

  const blocked = new NativeSessionController({ stdin: null, mode: "inherit" });
  assert.equal(blocked.isControllable(), false);
  assert.throws(() => blocked.sendText("nope"), /not controllable/i);

  const ptyChunks = [];
  const ptyController = new NativeSessionController({
    writer(value) {
      ptyChunks.push(value);
    },
    mode: "pty"
  });
  const previousDelay = process.env.QUICK_CODEX_WRAP_NATIVE_PTY_SUBMIT_DELAY_MS;
  try {
    process.env.QUICK_CODEX_WRAP_NATIVE_PTY_SUBMIT_DELAY_MS = "5";
    ptyController.sendText("hello");
    assert.equal(ptyChunks.join(""), "hello");
    await new Promise((resolve) => setTimeout(resolve, 20));
    ptyController.sendSlashCommand("/clear");
    assert.equal(ptyChunks.join(""), "hello\u001b[13u/clear\u001b[13u");
  } finally {
    if (previousDelay == null) {
      delete process.env.QUICK_CODEX_WRAP_NATIVE_PTY_SUBMIT_DELAY_MS;
    } else {
      process.env.QUICK_CODEX_WRAP_NATIVE_PTY_SUBMIT_DELAY_MS = previousDelay;
    }
  }
});

test("launchNativeCodexSession exposes observer state and controller availability in pipe mode", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-observer-"));
  const fakeNative = makeFakeObservedNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_OBSERVED_NATIVE_STDIN: process.env.FAKE_OBSERVED_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.controllerAvailable, true);
    assert.equal(result.observer.snapshot.bridgeState, "stopped");
    assert.equal(result.observer.snapshot.promptReady, true);
    assert.equal(result.observer.snapshot.turnSettled, true);
    assert.equal(result.observer.snapshot.sessionId, "019d9b43-1163-77f1-92f8-f51d1d19daf9");
    assert.equal(result.observer.events.some((entry) => entry.type === "bridge-ready"), true);
    assert.equal(result.observer.events.some((entry) => entry.type === "prompt-ready"), true);
    assert.equal(result.observer.events.some((entry) => entry.type === "turn-settled"), true);
    assert.equal(await waitForFile(fakeNative.stdinPath), true);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("launchNativeCodexSession detects bridge readiness when codex app-server writes to stderr", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-observer-stderr-"));
  const fakeNative = makeFakeObservedNativeBridgeStderr(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_OBSERVED_NATIVE_STDERR_STDIN: process.env.FAKE_OBSERVED_NATIVE_STDERR_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.observer.events.some((entry) => entry.type === "bridge-ready"), true);
    assert.equal(result.observer.events.some((entry) => entry.source === "bridge-stderr"), true);
    assert.equal(await waitForFile(fakeNative.stdinPath), true);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("launchNativeCodexSession can inject a guarded /status slash command", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-"));
  const fakeNative = makeFakeGuardedSlashNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_NATIVE_STDIN: process.env.FAKE_GUARDED_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/status",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/status");
    assert.equal(result.guardedSlash.kind, "proof");
    assert.equal(result.guardedSlash.settledBy, "prompt-ready");
    assert.match(result.guardedSlash.settledText, /prompt restored after status/);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/status\n");
    assert.equal(result.observer.events.some((entry) => entry.type === "slash-injected"), true);
    assert.equal(result.observer.events.some((entry) => entry.type === "slash-settled"), true);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("interactive native bridge exposes guarded slash injection through CLI", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-native-guarded-"));
  const fakeNative = makeFakeGuardedSlashNativeBridge(projectDir);
  const result = runWrapCliWithEnv(projectDir, {
    ...fakeNative.env
  }, "chat", "--dir", projectDir, "--ui", "native", "--native-guarded-slash", "/status");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=await-ready \| command=\/status \| kind=proof/);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/status \| kind=proof \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/status\n");
});

test("launchNativeCodexSession can inject a guarded /compact continuity slash command", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-compact-"));
  const fakeNative = makeFakeGuardedCompactNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_COMPACT_NATIVE_STDIN: process.env.FAKE_GUARDED_COMPACT_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/compact",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/compact");
    assert.equal(result.guardedSlash.kind, "continuity");
    assert.equal(result.guardedSlash.settledBy, "prompt-ready");
    assert.match(result.guardedSlash.settledText, /prompt restored after compact/);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/compact\n");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("interactive native bridge exposes guarded /compact injection through CLI", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-native-guarded-compact-"));
  const fakeNative = makeFakeGuardedCompactNativeBridge(projectDir);
  const result = runWrapCliWithEnv(projectDir, {
    ...fakeNative.env
  }, "chat", "--dir", projectDir, "--ui", "native", "--native-guarded-slash", "/compact");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=await-ready \| command=\/compact \| kind=continuity/);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/compact \| kind=continuity \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/compact\n");
});

test("launchNativeCodexSession can inject a guarded /clear continuity slash command", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-clear-"));
  const fakeNative = makeFakeGuardedClearNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_CLEAR_NATIVE_STDIN: process.env.FAKE_GUARDED_CLEAR_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/clear",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/clear");
    assert.equal(result.guardedSlash.kind, "continuity");
    assert.equal(result.guardedSlash.settledBy, "prompt-ready");
    assert.match(result.guardedSlash.settledText, /prompt restored after clear/);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/clear\n");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("launchNativeCodexSession auto-dismisses the rate-limit modal before injecting guarded /clear", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-clear-modal-"));
  const fakeNative = makeFakeGuardedClearNativeBridgeWithRateLimitModal(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_CLEAR_MODAL_NATIVE_STDIN: process.env.FAKE_GUARDED_CLEAR_MODAL_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/clear",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/clear");
    assert.equal(result.observer.events.some((entry) => entry.type === "automation-choice-required"), true);
    assert.equal(result.observer.events.some((entry) => entry.type === "automation-choice-sent"), true);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "2/clear\n");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("NativeSessionObserver does not re-trigger the rate-limit modal from stale buffered text", () => {
  const observer = new NativeSessionObserver();

  observer.ingestChunk("pty-output", "Approaching rate limits");
  observer.ingestChunk("pty-output", "Keep current model");
  observer.ingestChunk("pty-output", "Press enter to confirm or esc to go back");

  const firstCount = observer.events.filter((entry) => entry.type === "automation-choice-required").length;
  assert.equal(firstCount, 1);

  observer.ingestChunk("pty-output", "› prompt restored after resume");
  observer.ingestChunk("pty-output", "Messages to be submitted after next tool call");
  observer.ingestChunk("pty-output", "›Improve documentation in @filename");

  const secondCount = observer.events.filter((entry) => entry.type === "automation-choice-required").length;
  assert.equal(secondCount, 1);
});

test("sendNativeTaskWithRetry can cross the busy boundary after multiple submit retries", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-task-multi-retry-"));
  const taskText = "Long task that needs multiple submit retries to start";
  const fakeCodex = makeFakeNativeTaskMultiRetryCodex(projectDir, taskText);
  const previousEnv = {
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ: process.env.QUICK_CODEX_WRAP_NATIVE_SUBMIT_SEQ,
    FAKE_NATIVE_TASK_MULTI_RETRY_STDIN: process.env.FAKE_NATIVE_TASK_MULTI_RETRY_STDIN
  };
  Object.assign(process.env, fakeCodex.env);

  try {
    const observer = new NativeSessionObserver();
    const child = spawn(process.env.QUICK_CODEX_REAL_CODEX_BIN, [], {
      cwd: projectDir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => observer.ingestChunk("codex-stdout", chunk));
    child.stderr.on("data", (chunk) => observer.ingestChunk("codex-stderr", chunk));

    const controller = new NativeSessionController({
      stdin: child.stdin,
      mode: "pipe",
      submitSequence: "\n"
    });

    const result = await sendNativeTaskWithRetry({
      controller,
      observer,
      task: taskText,
      timeoutMs: 4000,
      maxSubmitRetries: 3,
      onProgress: () => {}
    });

    assert.equal(result.startedBy, "native-busy");
    assert.equal(result.retries, 2);

    const exit = await new Promise((resolve) => child.once("close", (code) => resolve(code)));
    assert.equal(exit, 0);
    assert.equal(fs.readFileSync(fakeCodex.stdinPath, "utf8"), `${taskText}\n\n\n`);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("sendNativeTaskWithRetry falls back when startup marked prompt detection as delayed", async () => {
  const taskText = "Task should still submit after delayed prompt detection";
  const observer = new NativeSessionObserver();
  const sent = [];
  observer.markBridgeState("ready", { text: "remote=ws://127.0.0.1:4888" });
  observer.markCodexState("running", { text: "mode=pipe" });
  observer.markCodexState("waiting-for-prompt", { text: "prompt-detection-delayed" });

  const controller = {
    mode: "pipe",
    isControllable() {
      return true;
    },
    sendText(value) {
      sent.push(value);
      setTimeout(() => {
        observer.record("native-busy", {
          text: "•Working(0s • esc to interrupt)"
        });
      }, 10);
    },
    submit() {
      sent.push("<submit>");
    }
  };

  const result = await sendNativeTaskWithRetry({
    controller,
    observer,
    task: taskText,
    timeoutMs: 120,
    maxSubmitRetries: 1,
    onProgress: () => {}
  });

  assert.equal(result.startedBy, "native-busy");
  assert.equal(result.retries, 0);
  assert.deepEqual(sent, [taskText]);
  assert.equal(observer.events.some((entry) => entry.type === "task-await-ready-fallback"), true);
});

test("sendNativeTaskWithRetry falls back when the Codex startup banner is visible but prompt-ready was not detected yet", async () => {
  const taskText = "Task should submit from visible startup banner";
  const observer = new NativeSessionObserver();
  const sent = [];
  observer.markBridgeState("ready", { text: "remote=ws://127.0.0.1:4888" });
  observer.markCodexState("running", { text: "mode=pty" });
  observer.ingestChunk("pty-output", "╭────────────────────────────────────────────╮");
  observer.ingestChunk("pty-output", "│ >_ OpenAI Codex (v0.121.0)                 │");
  observer.ingestChunk("pty-output", "│ model:     gpt-5.4 high   /model to change │");
  observer.ingestChunk("pty-output", "│ directory: /mnt/d/Personal/Core            │");
  observer.ingestChunk("pty-output", "╰────────────────────────────────────────────╯");

  const controller = {
    mode: "pty",
    isControllable() {
      return true;
    },
    sendText(value) {
      sent.push(value);
      setTimeout(() => {
        observer.record("native-busy", {
          text: "•Working(0s • esc to interrupt)"
        });
      }, 10);
    },
    submit() {
      sent.push("<submit>");
    }
  };

  const progress = [];
  const result = await sendNativeTaskWithRetry({
    controller,
    observer,
    task: taskText,
    timeoutMs: 120,
    maxSubmitRetries: 1,
    onProgress: (entry) => progress.push(entry)
  });

  assert.equal(result.startedBy, "native-busy");
  assert.equal(result.retries, 0);
  assert.deepEqual(sent, [taskText]);
  assert.equal(progress.includes("native-task=await-ready-fallback | reason=startup-banner-visible"), true);
  assert.equal(
    observer.events.some((entry) => entry.type === "task-await-ready-fallback" && entry.reason === "startup-banner-visible"),
    true
  );
});

test("sendNativeTaskWithRetry includes observer trace details when submission start times out", async () => {
  const taskText = "Task that should expose timeout trace details";
  const observer = new NativeSessionObserver();
  const sent = [];
  observer.markBridgeState("ready", { text: "remote=ws://127.0.0.1:4888" });
  observer.markCodexState("ready", { text: "prompt-ready" });
  observer.record("prompt-ready", { text: "›" });
  observer.ingestChunk("pty-output", "model: gpt-5.4 high /model to change");

  const controller = {
    mode: "pty",
    isControllable() {
      return true;
    },
    sendText(value) {
      sent.push(value);
    },
    submit() {
      sent.push("<submit>");
    }
  };

  await assert.rejects(
    () => sendNativeTaskWithRetry({
      controller,
      observer,
      task: taskText,
      timeoutMs: 20,
      maxSubmitRetries: 1,
      onProgress: () => {}
    }),
    (error) => {
      assert.match(error.message, /Timed out waiting for native task submission to start\./);
      assert.match(error.message, /snapshot=\{/);
      assert.match(error.message, /recentEvents=\[/);
      assert.match(error.message, /task="Task that should expose timeout trace details"/);
      return true;
    }
  );

  assert.deepEqual(sent, [taskText]);
  assert.equal(observer.events.some((entry) => entry.type === "task-submit-timeout"), true);
});

test("sendNativeTaskWithRetry retries submit when a long task is echoed back through native-output before busy starts", async () => {
  const taskText = "Wrapper route: qc-flow Protocol enforcement: passthrough qc-flow contract is active. Run artifact: .quick-codex-flow/sample.md Current declared gate: clarify";
  const observer = new NativeSessionObserver();
  const sent = [];
  const progress = [];
  observer.markBridgeState("ready", { text: "remote=ws://127.0.0.1:4888" });
  observer.markCodexState("ready", { text: "prompt-ready" });
  observer.record("prompt-ready", { text: "›" });

  const controller = {
    mode: "pty",
    isControllable() {
      return true;
    },
    sendText(value) {
      sent.push(value);
      setTimeout(() => {
        observer.record("native-output", {
          text: `› ${value}`
        });
      }, 5);
    },
    submit() {
      sent.push("<submit>");
      setTimeout(() => {
        observer.record("native-busy", {
          text: "•Working(0s • esc to interrupt)"
        });
      }, 5);
    }
  };

  const result = await sendNativeTaskWithRetry({
    controller,
    observer,
    task: taskText,
    timeoutMs: 120,
    maxSubmitRetries: 1,
    onProgress: (entry) => progress.push(entry)
  });

  assert.equal(result.startedBy, "native-busy");
  assert.equal(result.retries, 1);
  assert.deepEqual(sent, [taskText, "<submit>"]);
  assert.equal(progress.includes("native-task=retry-submit | retry=1 | source=native-output"), true);
  assert.equal(
    observer.events.some((entry) => entry.type === "task-submit-retry" && entry.sourceEventType === "native-output"),
    true
  );
});

test("NativeRemoteSession.resize returns false when node-pty resize races with a closed fd", () => {
  const session = new NativeRemoteSession({
    dir: "/tmp/qc-native-resize-test",
    stdioMode: "pty"
  });
  session.codexChild = {
    resize() {
      const error = new Error("ioctl(2) failed, EBADF");
      error.code = "EBADF";
      throw error;
    }
  };

  assert.equal(session.resize(120, 40), false);
  assert.equal(session.cols, 120);
  assert.equal(session.rows, 40);
});

test("launchNativeCodexSession retries submit when guarded /clear remains in the composer", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-clear-retry-"));
  const fakeNative = makeFakeGuardedClearRetryNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_CLEAR_RETRY_NATIVE_STDIN: process.env.FAKE_GUARDED_CLEAR_RETRY_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/clear",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/clear");
    assert.equal(result.guardedSlash.submitRetries, 1);
    assert.equal(result.observer.events.some((entry) => entry.type === "slash-submit-retry"), true);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/clear\n\n");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("launchNativeCodexSession waits for a follow-up prompt when guarded /resume settles early via turn-settled residue", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-resume-turn-settled-"));
  const fakeNative = makeFakeGuardedResumeTurnSettledNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_RESUME_TURN_SETTLED_NATIVE_STDIN: process.env.FAKE_GUARDED_RESUME_TURN_SETTLED_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/resume --last",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/resume --last");
    assert.equal(result.guardedSlash.settledBy, "prompt-ready");
    assert.equal(result.guardedSlash.submitRetries, 1);
    assert.equal(result.observer.events.some((entry) => entry.type === "slash-await-followup-prompt"), true);
    assert.equal(result.observer.events.some((entry) => entry.type === "slash-submit-retry"), true);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/resume --last\n\n");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("launchNativeCodexSession can inject a guarded /resume continuity slash command with an explicit target", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-resume-"));
  const fakeNative = makeFakeGuardedResumeNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_RESUME_NATIVE_STDIN: process.env.FAKE_GUARDED_RESUME_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/resume my-saved-thread",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/resume my-saved-thread");
    assert.equal(result.guardedSlash.kind, "continuity");
    assert.equal(result.guardedSlash.settledBy, "prompt-ready");
    assert.equal(result.guardedSlash.submitRetries, 0);
    assert.match(result.guardedSlash.settledText, /prompt restored after resume/);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/resume my-saved-thread\n");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("launchNativeCodexSession can inject a guarded /resume --last continuity slash command", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-native-guarded-resume-last-"));
  const fakeNative = makeFakeGuardedResumeNativeBridge(projectDir);
  const previousEnv = {
    QUICK_CODEX_WRAP_APP_SERVER_BIN: process.env.QUICK_CODEX_WRAP_APP_SERVER_BIN,
    QUICK_CODEX_REAL_CODEX_BIN: process.env.QUICK_CODEX_REAL_CODEX_BIN,
    FAKE_GUARDED_RESUME_NATIVE_STDIN: process.env.FAKE_GUARDED_RESUME_NATIVE_STDIN
  };
  Object.assign(process.env, fakeNative.env);
  try {
    const result = await launchNativeCodexSession({
      dir: projectDir,
      stdioMode: "pipe",
      forwardOutput: false,
      guardedSlashCommand: "/resume --last",
      observer: new NativeSessionObserver(),
      onProgress: () => {},
      policy: {
        permissionProfile: "safe",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        bypassApprovalsAndSandbox: false
      }
    });

    assert.equal(result.status, 0);
    assert.equal(result.guardedSlash.command, "/resume --last");
    assert.equal(result.guardedSlash.kind, "continuity");
    assert.equal(result.guardedSlash.settledBy, "prompt-ready");
    assert.equal(result.guardedSlash.submitRetries, 0);
    assert.match(result.guardedSlash.settledText, /prompt restored after resume/);
    assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/resume --last\n");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("interactive native bridge exposes guarded /clear injection through CLI", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-native-guarded-clear-"));
  const fakeNative = makeFakeGuardedClearNativeBridge(projectDir);
  const result = runWrapCliWithEnv(projectDir, {
    ...fakeNative.env
  }, "chat", "--dir", projectDir, "--ui", "native", "--native-guarded-slash", "/clear");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=await-ready \| command=\/clear \| kind=continuity/);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/clear \| kind=continuity \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/clear\n");
});

test("interactive native bridge exposes guarded /resume injection through CLI", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-native-guarded-resume-"));
  const fakeNative = makeFakeGuardedResumeNativeBridge(projectDir);
  const result = runWrapCliWithEnv(projectDir, {
    ...fakeNative.env
  }, "chat", "--dir", projectDir, "--ui", "native", "--native-guarded-slash", "/resume my-saved-thread");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=await-ready \| command=\/resume my-saved-thread \| kind=continuity/);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/resume my-saved-thread \| kind=continuity \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/resume my-saved-thread\n");
});

test("interactive native bridge exposes guarded /resume --last injection through CLI", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-native-guarded-resume-last-"));
  const fakeNative = makeFakeGuardedResumeNativeBridge(projectDir);
  const result = runWrapCliWithEnv(projectDir, {
    ...fakeNative.env
  }, "chat", "--dir", projectDir, "--ui", "native", "--native-guarded-slash", "/resume --last");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] native-slash=await-ready \| command=\/resume --last \| kind=continuity/);
  assert.match(result.stdout, /\[wrapper\] native-slash=settled \| command=\/resume --last \| kind=continuity \| via=prompt-ready/);
  assert.equal(fs.readFileSync(fakeNative.stdinPath, "utf8"), "/resume --last\n");
});

test("interactive wrapper shell prints lifecycle progress before the final response", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-progress-"));
  const fakeCodex = makeFakeCodex(projectDir, []);
  const result = runWrapCliWithInputAndEnv(projectDir, {
    ...fakeCodex.env
  }, "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug\n/exit\n", "chat", "--dir", projectDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\[wrapper\] analyzing task=/);
  assert.match(result.stdout, /\[wrapper\] route=qc-lock \| source=heuristic-fallback|\[wrapper\] route=qc-lock \| source=task-router/);
  assert.match(result.stdout, /\[wrapper\] launching adapter=exec/);
  assert.match(result.stdout, /fake codex assistant reply/);
});

test("interactive wrapper shell applies /perm and /approval before launching the next task", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-perm-"));
  const fakeCodex = makeFakeCodex(projectDir, []);
  const result = runWrapCliWithInputAndEnv(projectDir, {
    ...fakeCodex.env
  }, "/perm full\n/approval autonomous\n/status\nfix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug\n/exit\n", "chat", "--dir", projectDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /permissionProfile=full/);
  assert.match(result.stdout, /approvalMode=never/);
  assert.match(result.stdout, /\[wrapper\].*perm=full.*approval=never/);
});

test("interactive wrapper shell applies /route before launching the next task", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-route-"));
  const fakeCodex = makeFakeCodex(projectDir, []);
  const result = runWrapCliWithInputAndEnv(projectDir, {
    ...fakeCodex.env
  }, "/route direct\n/status\nfix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug\n/exit\n", "chat", "--dir", projectDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /routeOverride=direct/);
  assert.match(result.stdout, /\[wrapper\] route=direct/);
  assert.match(result.stdout, /fake codex assistant reply/);
});

test("interactive wrapper shell presents disambiguation options and accepts a numbered choice", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-disambiguation-"));
  const router = await startFakeExperienceRouter(projectDir, {
    routeTaskResponses: [{
      needs_disambiguation: true,
      source: "brain",
      reason: "The task is ambiguous enough to require a user choice.",
      options: [
        {
          id: "implement",
          label: "Implement a narrow fix",
          route: "qc-lock",
          description: "Treat it as a narrow execution task."
        },
        {
          id: "plan",
          label: "Plan and research first",
          route: "qc-flow",
          description: "Clarify and inspect the repo before coding."
        }
      ]
    }],
    routeModelResponses: []
  });
  try {
    const fakeCodex = makeFakeCodex(projectDir, []);
    const result = runWrapCliWithInputAndEnv(projectDir, {
      ...fakeCodex.env,
      QUICK_CODEX_EXPERIENCE_URL: router.baseUrl,
      QUICK_CODEX_WRAP_ENABLE_TASK_ROUTER: "1"
    }, "make the wrapper better\n1\n/exit\n", "chat", "--dir", projectDir);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Task routing requires clarification/);
    assert.match(result.stdout, /1\. Implement a narrow fix/);
    assert.match(result.stdout, /\[wrapper\] route=qc-lock/);
    assert.match(result.stdout, /fake codex assistant reply/);
  } finally {
    await router.close();
  }
});

test("interactive wrapper shell supports command-style task, follow, and turn controls", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-chat-commands-"));
  const fakeCodex = makeFakeCodex(projectDir, []);
  const result = runWrapCliWithInputAndEnv(projectDir, {
    ...fakeCodex.env
  }, "/follow off\n/turns 7\n/status\n/task fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug\n/exit\n", "chat", "--dir", projectDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /follow=false/);
  assert.match(result.stdout, /maxTurns=7/);
  assert.match(result.stdout, /\[wrapper\].*turns=1/);
  assert.match(result.stdout, /fake codex assistant reply/);
});

test("quick-codex init seeds wrapper-config.json into the project scaffold", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-init-config-"));
  const result = runCli(process.cwd(), "init", "--dir", dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const configPath = path.join(dir, ".quick-codex-flow", "wrapper-config.json");
  assert.equal(fs.existsSync(configPath), true);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.defaults.permissionProfile, "safe");
  assert.equal(config.defaults.executionProfile, "follow-safe");
  assert.equal(config.defaults.chat.uiRenderer, "auto");
});

test("bare codex now launches the real native Codex binary by default", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-native-"));
  const fakeRealCodex = path.join(projectDir, "fake-real-codex.mjs");
  fs.writeFileSync(fakeRealCodex, `#!/usr/bin/env node
console.log("FAKE_NATIVE_CODEX");
console.log(JSON.stringify(process.argv.slice(2)));
`, "utf8");
  fs.chmodSync(fakeRealCodex, 0o755);
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_REAL_CODEX_BIN: fakeRealCodex
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /FAKE_NATIVE_CODEX/);
  assert.match(result.stdout, /\[\]/);
});

test("codex --qc-ui launches the Electron host and forwards --qc-dir as QUICK_CODEX_DIR", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-electron-"));
  const fakeRealCodex = path.join(projectDir, "fake-real-codex.mjs");
  const fakeElectronHost = path.join(projectDir, "fake-electron-host.mjs");
  const envDumpPath = path.join(projectDir, "electron-env.txt");
  fs.writeFileSync(fakeRealCodex, `#!/usr/bin/env node
console.log("REAL_CODEX_SHOULD_NOT_RUN");
`, "utf8");
  fs.chmodSync(fakeRealCodex, 0o755);
  fs.writeFileSync(fakeElectronHost, `#!/usr/bin/env node
import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(envDumpPath)}, process.env.QUICK_CODEX_DIR || "", "utf8");
console.log("FAKE_ELECTRON_HOST");
console.log(JSON.stringify(process.argv.slice(2)));
`, "utf8");
  fs.chmodSync(fakeElectronHost, 0o755);
  const result = runCodexShimWithEnv(projectDir, {
    QUICK_CODEX_REAL_CODEX_BIN: fakeRealCodex,
    QUICK_CODEX_ELECTRON_HOST_BIN: fakeElectronHost
  }, "--qc-ui", "--qc-dir", projectDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /FAKE_ELECTRON_HOST/);
  assert.doesNotMatch(result.stdout, /REAL_CODEX_SHOULD_NOT_RUN/);
  assert.equal(fs.readFileSync(envDumpPath, "utf8"), projectDir);
});

test("quick-codex install-codex-shim writes a codex-compatible launcher", () => {
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shim-"));
  const fakeRealCodex = path.join(shimDir, "codex-real");
  fs.writeFileSync(fakeRealCodex, "#!/usr/bin/env bash\nexit 0\n", "utf8");
  fs.chmodSync(fakeRealCodex, 0o755);
  const result = runCli(process.cwd(), "install-codex-shim", "--target", shimDir, "--real-codex", fakeRealCodex, "--force");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const shimPath = path.join(shimDir, "codex");
  assert.equal(fs.existsSync(shimPath), true);
  const shimText = fs.readFileSync(shimPath, "utf8");
  assert.match(shimText, /QUICK_CODEX_REAL_CODEX_BIN/);
  assert.match(shimText, /codex-qc-shim\.js/);
});

test("classifyAutoFollowStop detects ask-user and relock boundaries", () => {
  const askUser = classifyAutoFollowStop({
    previousArtifact: null,
    artifact: {
      currentGate: "execute",
      recommendedNextCommand: "Ask the user to confirm the new scope before continuing.",
      blockers: []
    },
    flowState: { status: "active" },
    decision: {
      handoffAction: "compact-session",
      prompt: "Ask the user to confirm the new scope before continuing."
    }
  });
  assert.equal(askUser.stopReason, "ask-user");

  const relock = classifyAutoFollowStop({
    previousArtifact: null,
    artifact: {
      currentGate: "execute",
      recommendedNextCommand: "Relock from the run artifact before continuing.",
      blockers: []
    },
    flowState: { status: "active" },
    decision: {
      handoffAction: "relock-first",
      prompt: "Relock from the run artifact before continuing."
    }
  });
  assert.equal(relock.stopReason, "relock");
});

test("inspectProjectBootstrap marks missing scaffold for qc-flow routes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-wrap-bootstrap-"));
  const inspection = inspectProjectBootstrap({ dir, route: "qc-flow" });
  assert.equal(inspection.bootstrapRequired, true);
  assert.equal(inspection.scaffoldPresent, false);
});

test("ensureProjectBootstrap creates quick-codex scaffold for qc-flow routes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-wrap-bootstrap-"));
  const bootstrap = ensureProjectBootstrap({ dir, route: "qc-flow" });
  assert.equal(bootstrap.bootstrapPerformed, true);
  assert.match(bootstrap.summary, /was created before the live qc-flow raw-task launch/);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "STATE.md")), true);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "sample-run.md")), true);
});

test("wrap run dry-run reports planned bootstrap for a fresh qc-flow project without mutating it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-wrap-bootstrap-"));
  const result = runWrapCli(dir, "run", "--dir", dir, "--task", "design a thin wrapper before Codex CLI that auto-routes tasks and explain the plan only without editing files", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.route, "qc-flow");
  assert.equal(payload.bootstrap.planned, true);
  assert.equal(payload.bootstrap.performed, false);
  assert.match(payload.bootstrap.summary, /would create it before a live qc-flow raw-task launch/);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "STATE.md")), false);
  assert.match(payload.prompt, /Wrapper bootstrap: Quick Codex scaffold is missing/);
});

test("wrap prompt prefers a suitable active run over a generic raw-task qc-flow prompt", () => {
  const activeRun = routedWaveRun
    .replace("# Run: sample", "# Run: wrapper state aware routing")
    .replace("Original goal:\n- validate quick-codex command surface", "Original goal:\n- make wrapper state-aware so it prefers matching active runs")
    .replaceAll(".quick-codex-flow/sample.md", ".quick-codex-flow/wrapper-state-aware.md");
  const project = makeProject(activeRun, "wrapper-state-aware.md");
  const result = runWrapCli(project.dir, "prompt", "--dir", project.dir, "--task", "make the wrapper state-aware so it prefers a matching active run before generic prompt routing", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.promptSource, "active-run");
  assert.equal(payload.activeRun, ".quick-codex-flow/wrapper-state-aware.md");
  assert.match(payload.prompt, /resume from \.quick-codex-flow\/wrapper-state-aware\.md/i);
});

test("wrap prompt does not let an unrelated workspace active run hijack an explicitly named sibling repo task", () => {
  const activeRun = routedWaveRun
    .replace("# Run: sample", "# Run: codex cli wrapper orchestrator")
    .replace("Original goal:\n- validate quick-codex command surface", "Original goal:\n- continue codex cli wrapper orchestrator work")
    .replaceAll(".quick-codex-flow/sample.md", ".quick-codex-flow/codex-cli-wrapper-orchestrator.md");
  const project = makeProject(activeRun, "codex-cli-wrapper-orchestrator.md");
  fs.mkdirSync(path.join(project.dir, "storyflow"), { recursive: true });
  const result = runWrapCli(project.dir, "prompt", "--dir", project.dir, "--task", "I have a repository called Storyflow. Please explore it and review its anti-bot feature.", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.notEqual(payload.promptSource, "active-run");
  assert.notEqual(payload.routeSource, "active-run");
});

test("wrap prompt does not prefer the bootstrap sample run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-wrap-bootstrap-"));
  const bootstrap = ensureProjectBootstrap({ dir, route: "qc-flow" });
  assert.equal(bootstrap.bootstrapPerformed, true);
  const result = runWrapCli(dir, "prompt", "--dir", dir, "--task", "design a thin wrapper before Codex CLI that auto-routes tasks and explain the plan only without editing files", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.promptSource, "task-router");
  assert.equal(payload.activeRun ?? null, null);
});

test("wrap run dry-run prefers an active run instead of the generic raw-task prompt", () => {
  const activeRun = routedWaveRun
    .replace("# Run: sample", "# Run: wrapper state aware routing")
    .replace("Original goal:\n- validate quick-codex command surface", "Original goal:\n- continue the thin wrapper codex cli auto routing work")
    .replaceAll(".quick-codex-flow/sample.md", ".quick-codex-flow/wrapper-routing.md");
  const project = makeProject(activeRun, "wrapper-routing.md");
  const result = runWrapCli(project.dir, "run", "--dir", project.dir, "--task", "continue the thin wrapper codex cli auto routing work and explain the next step", "--dry-run", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.promptSource, "active-run");
  assert.equal(payload.activeRun, ".quick-codex-flow/wrapper-routing.md");
  assert.match(payload.prompt, /resume from \.quick-codex-flow\/wrapper-routing\.md/i);
});
