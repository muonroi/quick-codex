import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { resolveElectronHostAppDir } from "../lib/electron-host.js";

function waitForClose(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out waiting for Electron passthrough e2e scenario."));
    }, timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function runElectronScenario(scenario) {
  const appDir = resolveElectronHostAppDir({
    cwd: process.cwd(),
    env: process.env
  });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-electron-e2e-"));
  const traceFile = path.join(tmpDir, `${scenario}-trace.json`);

  const child = spawn("xvfb-run", ["-a", "npm", "run", "dev"], {
    cwd: appDir,
    env: {
      ...process.env,
      QUICK_CODEX_ELECTRON_TEST_SCENARIO: scenario,
      QUICK_CODEX_ELECTRON_TEST_TRACE_FILE: traceFile
    },
    stdio: "ignore"
  });

  const result = await waitForClose(child);
  assert.equal(result.code, 0);
  assert.equal(fs.existsSync(traceFile), true);
  return JSON.parse(fs.readFileSync(traceFile, "utf8"));
}

function sessionEvents(trace) {
  return trace.trace
    .filter((entry) => entry.channel === "session-event")
    .map((entry) => entry.payload);
}

test("Electron host proves passthrough follow-loop chaining end-to-end through the app boundary", async () => {
  const trace = await runElectronScenario("passthrough-follow");
  const events = sessionEvents(trace);

  const taskRoute = events.find((entry) => entry.type === "task-route");
  const followAction = events.find((entry) => entry.type === "follow-loop-action");
  const slashResult = events.find((entry) => entry.type === "slash-result" && entry.source === "follow-loop");
  const followFinished = events.find((entry) => entry.type === "follow-loop-finished");

  assert.equal(trace.scenario, "passthrough-follow");
  assert.equal(taskRoute?.source, "passthrough-intercept");
  assert.equal(taskRoute?.route, "direct");
  assert.equal(followAction?.slashCommand, "/compact");
  assert.equal(followAction?.continuePrompt, "Continue after compact.");
  assert.equal(slashResult?.result?.command, "/compact");
  assert.equal(followFinished?.stoppedBecause, "no-checkpoint-progress");
});

test("Electron host proves a dedicated passthrough /resume continuity path end-to-end", async () => {
  const trace = await runElectronScenario("passthrough-resume");
  const events = sessionEvents(trace);

  const taskRoute = events.find((entry) => entry.type === "task-route");
  const followAction = events.find((entry) => entry.type === "follow-loop-action");
  const slashResult = events.find((entry) => entry.type === "slash-result" && entry.source === "follow-loop");
  const followFinished = events.find((entry) => entry.type === "follow-loop-finished");

  assert.equal(trace.scenario, "passthrough-resume");
  assert.equal(taskRoute?.source, "passthrough-intercept");
  assert.equal(taskRoute?.route, "qc-flow");
  assert.equal(followAction?.slashCommand, "/resume --last");
  assert.equal(followAction?.continuePrompt, "Continue after resume.");
  assert.equal(slashResult?.result?.command, "/resume --last");
  assert.equal(followFinished?.stoppedBecause, "no-checkpoint-progress");
});

test("Electron host can keep native passthrough automation invisible across multiple chained follow turns", async () => {
  const trace = await runElectronScenario("passthrough-invisible-chain");
  const events = sessionEvents(trace);

  const started = trace.trace.filter((entry) => entry.channel === "started");
  const taskRoute = events.find((entry) => entry.type === "task-route");
  const followActions = events.filter((entry) => entry.type === "follow-loop-action");
  const slashResults = events.filter((entry) => entry.type === "slash-result" && entry.source === "follow-loop");
  const taskResults = events.filter((entry) => entry.type === "task-result");
  const followFinished = events.find((entry) => entry.type === "follow-loop-finished");

  assert.equal(trace.scenario, "passthrough-invisible-chain");
  assert.equal(started.length, 1);
  assert.equal(taskRoute?.source, "passthrough-intercept");
  assert.deepEqual(
    followActions.map((entry) => entry.slashCommand),
    ["/resume --last", "/compact"]
  );
  assert.deepEqual(
    slashResults.map((entry) => entry.result?.command),
    ["/resume --last", "/compact"]
  );
  assert.equal(taskResults.filter((entry) => entry.source === "follow-loop").length, 2);
  assert.equal(followFinished?.turnsExecuted, 3);
  assert.equal(followFinished?.stoppedBecause, "no-checkpoint-progress");
});
