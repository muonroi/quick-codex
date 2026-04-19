import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createQuickCodexHostApi } from "../host-api.js";
import { resolveElectronHostAppDir } from "../lib/electron-host.js";

class FakeNativeSession {
  constructor(options) {
    this.options = options;
    this.tasks = [];
    this.controller = {
      isControllable: () => true,
      sendRaw() {}
    };
  }

  async start() {
    this.options.onOutputChunk?.("BOOT", { source: "pty-output" });
    return this;
  }

  async stop() {}

  async task(prompt) {
    this.tasks.push(prompt);
    return { prompt };
  }

  async slash(command) {
    return { command };
  }

  resize() {
    return true;
  }
}

test("an out-of-repo Electron host consumer can import quick-codex/host-api through copied session-manager code", async () => {
  const repoDir = process.cwd();
  const appDir = resolveElectronHostAppDir({
    cwd: repoDir,
    env: process.env
  });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-electron-external-"));
  const nodeModulesDir = path.join(tmpDir, "node_modules");
  const externalAppDir = path.join(tmpDir, "external-qc-electron");
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  fs.mkdirSync(externalAppDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "external-qc-electron-proof", private: true, type: "module" }, null, 2),
    "utf8"
  );
  fs.symlinkSync(repoDir, path.join(nodeModulesDir, "quick-codex"), "dir");

  const copiedSessionManagerPath = path.join(externalAppDir, "session-manager.mjs");
  fs.copyFileSync(path.join(appDir, "session-manager.mjs"), copiedSessionManagerPath);

  const { ElectronSessionManager } = await import(pathToFileURL(copiedSessionManagerPath).href);

  const sessions = [];
  const hostApi = createQuickCodexHostApi({
    createNativeSession: (options) => {
      const session = new FakeNativeSession(options);
      sessions.push(session);
      return session;
    },
    createNativeSessionObserver: () => ({
      on() {},
      toJSON() {
        return { snapshot: null };
      }
    }),
    compileTaskPrompt: ({ route, task }) => `PROMPT:${route}:${task}`,
    enforceQcFlowProtocol: null,
    enforceQcLockProtocol: null,
    buildCheckpointSummary: () => null,
    classifyAutoFollowStop: () => ({
      shouldStop: true,
      stopReason: "max-turns-reached",
      checkpointAdvanced: false
    }),
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
    readActiveRunArtifact: () => null,
    resolveAutoContinuation: () => ({
      flowState: null,
      artifact: null,
      decision: null
    }),
    resolveExperienceModelRoute: async () => ({ applied: false }),
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
    routeTask: () => ({
      route: "direct",
      reason: "external consumer proof"
    })
  });

  const manager = new ElectronSessionManager({ hostApi });
  await manager.startSession({
    mode: "passthrough",
    dir: tmpDir,
    maxTurns: 1
  });
  const submitted = await manager.submitInterceptedTask("prove package-style host boundary");

  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].tasks, ["PROMPT:direct:prove package-style host boundary"]);
  assert.equal(submitted.routed.route, "direct");
});
