import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { resolveSessionContext } from "../lib/wrapper/session-context.js";
import { baseRun, cliPath, repoRoot, runCli, runCliWithEnv } from "./test-helpers.js";

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-session-cli-"));
}

function sessionState(run = "runs/sample.md", lock = "none") {
  return `# Quick Codex Flow State

Active run:
- ${run}

Active lock:
- ${lock}

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`;
}

function createSession(dir, id, runText = baseRun) {
  const context = resolveSessionContext({ dir, sessionId: id });
  fs.mkdirSync(context.runsDir, { recursive: true });
  fs.mkdirSync(context.locksDir, { recursive: true });
  fs.writeFileSync(path.join(context.runsDir, "sample.md"), runText, "utf8");
  fs.writeFileSync(context.statePath, sessionState(), "utf8");
  fs.copyFileSync(path.join(repoRoot, "templates", ".quick-codex-flow", "PROJECT-ROADMAP.md"), context.projectRoadmapPath);
  fs.copyFileSync(path.join(repoRoot, "templates", ".quick-codex-flow", "BACKLOG.md"), context.backlogPath);
  fs.writeFileSync(context.wrapperStatePath, `${JSON.stringify({ version: 1, runs: { "runs/sample.md": { marker: id } } }, null, 2)}\n`, "utf8");
  return context;
}

function createLegacyGraph(dir) {
  const flowDir = path.join(dir, ".quick-codex-flow");
  const lockDir = path.join(dir, ".quick-codex-lock");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, "sample.md"), baseRun, "utf8");
  fs.writeFileSync(path.join(flowDir, "STATE.md"), sessionState(".quick-codex-flow/sample.md"), "utf8");
  fs.copyFileSync(path.join(repoRoot, "templates", ".quick-codex-flow", "PROJECT-ROADMAP.md"), path.join(flowDir, "PROJECT-ROADMAP.md"));
  fs.copyFileSync(path.join(repoRoot, "templates", ".quick-codex-flow", "BACKLOG.md"), path.join(flowDir, "BACKLOG.md"));
  fs.writeFileSync(path.join(flowDir, "wrapper-state.json"), `${JSON.stringify({ version: 1, runs: { ".quick-codex-flow/sample.md": { lastMode: "new" } } }, null, 2)}\n`, "utf8");
  return { flowDir, lockDir };
}

function snapshotTree(root, excluded = new Set()) {
  const snapshot = {};
  function visit(current, relative = "") {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (excluded.has(nextRelative)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute, nextRelative);
      else snapshot[nextRelative] = fs.readFileSync(absolute).toString("hex");
    }
  }
  if (fs.existsSync(root)) visit(root);
  return snapshot;
}

function waitForFiles(paths, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (paths.every((filePath) => fs.existsSync(filePath))) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for ${paths.join(", ")}`));
      setTimeout(poll, 10);
    };
    poll();
  });
}

function spawnBarrierWorker({ workerPath, readyPath, gatePath, resultPath, projectDir, args }) {
  return spawn(process.execPath, [workerPath, readyPath, gatePath, resultPath, projectDir, cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, QUICK_CODEX_NO_UPDATE_CHECK: "1" },
    stdio: "ignore"
  });
}

test("--session selects a namespace and a single canonical namespace is the default", () => {
  const dir = makeDir();
  createSession(dir, "thread-a");

  const explicit = runCli(dir, "status", "--dir", dir, "--session", "thread-a");
  assert.equal(explicit.status, 0, explicit.stderr || explicit.stdout);
  assert.match(explicit.stdout, /Active run: .*sessions\/thread-a\/runs\/sample\.md|Active run: runs\/sample\.md/);

  const implicit = runCli(dir, "status", "--dir", dir);
  assert.equal(implicit.status, 0, implicit.stderr || implicit.stdout);
  assert.match(implicit.stdout, /thread-a|runs\/sample\.md/);
});

test("--session resolves an explicit session-relative run pointer", () => {
  const dir = makeDir();
  createSession(dir, "thread-a");

  const result = runCli(dir, "status", "--dir", dir, "--session", "thread-a", "--run", "runs/sample.md");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /thread-a|runs\/sample\.md/);
});

test("status refuses ambiguous session namespaces without --session or --run", () => {
  const dir = makeDir();
  createSession(dir, "thread-a");
  createSession(dir, "thread-b");

  const result = runCli(dir, "status", "--dir", dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--session|--run/);
});

test("default selection fails closed when a session namespace has unresolved ownership", () => {
  const dir = makeDir();
  createLegacyGraph(dir);
  const brokenRoot = path.join(dir, ".quick-codex-flow", "sessions", "broken-thread");
  fs.mkdirSync(brokenRoot, { recursive: true });
  fs.writeFileSync(path.join(brokenRoot, ".session.json"), "{not-json", "utf8");

  const result = runCli(dir, "status", "--dir", dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest|owner|--session|--run/i);
});

test("explicit run ownership outranks ambient session and mismatched selectors fail closed", () => {
  const dir = makeDir();
  const a = createSession(dir, "thread-a");
  const b = createSession(dir, "thread-b");
  const beforeB = snapshotTree(b.root);
  const hookPath = path.join(dir, "hook.txt");
  fs.writeFileSync(hookPath, "⚠️ [Experience] session owner check [id:owner1 col:test]\nWhy: companion state must stay with the explicit run\n", "utf8");

  const result = runCliWithEnv(dir, { CODEX_THREAD_ID: "thread-b" }, "capture-hooks", "--dir", dir, "--run", path.join(a.runsDir, "sample.md"), "--input", hookPath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(fs.readFileSync(a.statePath, "utf8"), /runs\/sample\.md/);
  assert.deepEqual(snapshotTree(b.root), beforeB);

  const mismatch = runCli(dir, "status", "--dir", dir, "--run", path.join(a.runsDir, "sample.md"), "--session", "thread-b");
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /must agree/);
});

test("an unknown trusted ambient identity never mutates the sole unrelated namespace", () => {
  const dir = makeDir();
  const a = createSession(dir, "thread-a");
  const beforeA = snapshotTree(a.root);
  const hookPath = path.join(dir, "ambient-owner-hook.txt");
  fs.writeFileSync(hookPath, "⚠️ [Experience] ambient owner check [id:ambient1 col:test]\nWhy: trusted identity must not fall through to another owner\n", "utf8");

  const result = runCliWithEnv(dir, { CODEX_THREAD_ID: "thread-b", CODEX_SESSION_ID: "" }, "capture-hooks", "--dir", dir, "--input", hookPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /thread-b|--session|identity|namespace/i);
  assert.deepEqual(snapshotTree(a.root), beforeA);
});

test("an empty primary trusted identity selects an existing fallback namespace", () => {
  const dir = makeDir();
  createSession(dir, "thread-b");

  const result = runCliWithEnv(dir, { CODEX_THREAD_ID: "", CODEX_SESSION_ID: "thread-b" }, "status", "--dir", dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /thread-b|runs\/sample\.md/);
});

test("an empty primary trusted identity does not mask a non-empty fallback identity", () => {
  const dir = makeDir();
  const a = createSession(dir, "thread-a");
  const beforeA = snapshotTree(a.root);
  const hookPath = path.join(dir, "fallback-owner-hook.txt");
  fs.writeFileSync(hookPath, "⚠️ [Experience] fallback owner check [id:fallback1 col:test]\nWhy: empty primary identity must not mask the fallback owner\n", "utf8");

  const result = runCliWithEnv(dir, { CODEX_THREAD_ID: "", CODEX_SESSION_ID: "thread-b" }, "capture-hooks", "--dir", dir, "--input", hookPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /thread-b|--session|identity|namespace/i);
  assert.deepEqual(snapshotTree(a.root), beforeA);
});

test("a session state pointer cannot escape into another session namespace", () => {
  const dir = makeDir();
  const a = createSession(dir, "thread-a");
  const b = createSession(dir, "thread-b");
  fs.writeFileSync(a.statePath, sessionState(path.join(b.runsDir, "sample.md")), "utf8");
  const beforeB = snapshotTree(b.root);
  const hookPath = path.join(dir, "escape-hook.txt");
  fs.writeFileSync(hookPath, "⚠️ [Experience] escape check [id:escape1 col:test]\nWhy: foreign pointers must fail closed\n", "utf8");

  const result = runCli(dir, "capture-hooks", "--dir", dir, "--session", "thread-a", "--input", hookPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /escape|namespace|owner/i);
  assert.deepEqual(snapshotTree(b.root), beforeB);
});

test("explicit absolute run reads and explicit legacy selection remain compatible", () => {
  const dir = makeDir();
  createLegacyGraph(dir);
  createSession(dir, "thread-a");
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-external-run-"));
  const externalRun = path.join(externalDir, "external.md");
  fs.writeFileSync(externalRun, baseRun, "utf8");

  const legacy = runCli(dir, "status", "--dir", dir, "--legacy");
  assert.equal(legacy.status, 0, legacy.stderr || legacy.stdout);
  assert.match(legacy.stdout, /\.quick-codex-flow\/sample\.md/);

  const external = runCli(dir, "doctor-flow", "--dir", dir, "--run", externalRun);
  assert.equal(external.status, 0, external.stderr || external.stdout);
});

test("migration is dry-runnable, copy-only, collision-safe, and idempotent", () => {
  const dir = makeDir();
  createLegacyGraph(dir);
  const sourceBefore = snapshotTree(dir, new Set([".quick-codex-flow/sessions"]));

  const dryRun = runCli(dir, "migrate-state", "--to-session", "thread-a", "--dry-run", "--dir", dir);
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "sessions", "thread-a")), false);

  const migrated = runCli(dir, "migrate-state", "--to-session", "thread-a", "--dir", dir);
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  assert.deepEqual(snapshotTree(dir, new Set([".quick-codex-flow/sessions"])), sourceBefore);
  const target = path.join(dir, ".quick-codex-flow", "sessions", "thread-a");
  assert.equal(fs.existsSync(path.join(target, "runs", "sample.md")), true);
  assert.match(fs.readFileSync(path.join(target, "STATE.md"), "utf8"), /Active run:\n- runs\/sample\.md/);
  const manifest = JSON.parse(fs.readFileSync(path.join(target, ".migration.json"), "utf8"));
  assert.equal(manifest.status, "complete");
  assert.ok(manifest.files.every((entry) => entry.sourceSha256 && entry.destinationSha256));

  const targetBefore = snapshotTree(target);
  const rerun = runCli(dir, "migrate-state", "--to-session", "thread-a", "--dir", dir);
  assert.equal(rerun.status, 0, rerun.stderr || rerun.stdout);
  assert.match(rerun.stdout, /already complete|no-op/i);
  assert.deepEqual(snapshotTree(target), targetBefore);

  createSession(dir, "occupied");
  const collision = runCli(dir, "migrate-state", "--to-session", "occupied", "--dir", dir);
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /exists|collision|overwrite/i);
  assert.deepEqual(snapshotTree(dir, new Set([".quick-codex-flow/sessions"])), sourceBefore);
});

test("barrier-synchronized migrations and project updates keep concurrent sessions byte-isolated", async () => {
  const dir = makeDir();
  createLegacyGraph(dir);
  const workerPath = path.join(dir, "barrier-worker.mjs");
  fs.writeFileSync(workerPath, `import fs from "node:fs";\nimport { spawnSync } from "node:child_process";\nconst [ready, gate, result, cwd, cli, ...args] = process.argv.slice(2);\nfs.writeFileSync(ready, "ready");\nwhile (!fs.existsSync(gate)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);\nconst child = spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, QUICK_CODEX_NO_UPDATE_CHECK: "1" }, encoding: "utf8" });\nfs.writeFileSync(result, JSON.stringify({ status: child.status, stdout: child.stdout, stderr: child.stderr }));\n`, "utf8");
  const gatePath = path.join(dir, "go");
  const readyA = path.join(dir, "ready-a");
  const readyB = path.join(dir, "ready-b");
  const resultAPath = path.join(dir, "result-a.json");
  const resultBPath = path.join(dir, "result-b.json");
  const common = ["migrate-state"];
  const a = spawnBarrierWorker({ workerPath, readyPath: readyA, gatePath, resultPath: resultAPath, projectDir: repoRoot, args: [...common, "--to-session", "thread-a", "--dir", dir] });
  const b = spawnBarrierWorker({ workerPath, readyPath: readyB, gatePath, resultPath: resultBPath, projectDir: repoRoot, args: [...common, "--to-session", "thread-b", "--dir", dir] });
  await waitForFiles([readyA, readyB]);
  fs.writeFileSync(gatePath, "go");
  await Promise.all([
    new Promise((resolve) => a.once("exit", resolve)),
    new Promise((resolve) => b.once("exit", resolve))
  ]);
  const resultA = JSON.parse(fs.readFileSync(resultAPath, "utf8"));
  const resultB = JSON.parse(fs.readFileSync(resultBPath, "utf8"));
  assert.equal(resultA.status, 0, resultA.stderr || resultA.stdout);
  assert.equal(resultB.status, 0, resultB.stderr || resultB.stdout);

  const rootA = path.join(dir, ".quick-codex-flow", "sessions", "thread-a");
  const rootB = path.join(dir, ".quick-codex-flow", "sessions", "thread-b");
  assert.equal(fs.existsSync(path.join(rootA, "runs", "sample.md")), true);
  assert.equal(fs.existsSync(path.join(rootB, "runs", "sample.md")), true);
  assert.equal(fs.existsSync(path.join(rootA, "wrapper-state.json")), true);
  assert.equal(fs.existsSync(path.join(rootB, "wrapper-state.json")), true);

  const beforeB = snapshotTree(rootB);
  const syncA = runCli(dir, "sync-project", "--session", "thread-a", "--dir", dir);
  assert.equal(syncA.status, 0, syncA.stderr || syncA.stdout);
  assert.deepEqual(snapshotTree(rootB), beforeB);

  const afterA = snapshotTree(rootA);
  const syncB = runCli(dir, "sync-project", "--session", "thread-b", "--dir", dir);
  assert.equal(syncB.status, 0, syncB.stderr || syncB.stdout);
  assert.deepEqual(snapshotTree(rootA), afterA);
});
