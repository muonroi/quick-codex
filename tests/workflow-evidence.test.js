import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { baseRun, makeProject, runCli } from "./test-helpers.js";
import { readRunArtifact } from "../lib/wrapper/run-file.js";

const leanRun = `# Run: compact example
Artifact profile: lean

## Requirement Baseline
Original goal:
- prove both cache paths
Required outcomes:
- R1: cache hit and cache miss preserve the contract
Affected area / blast radius:
- source.js
Protected boundaries:
- no package publication or deployment

## Current Status
Current gate: execute
Current phase: P1
Current wave: W1
Execution state: in_progress
Execution mode: auto
Blockers: none
Next verify: node -e "process.exit(0)"
Recommended next command: verify-wave

## Evidence Basis
- source.js inspected locally

## Verified Plan
| Phase | Status | Purpose | Depends on | Verify |
|---|---|---|---|---|
| P1 | in_progress | preserve both cache paths | none | verification plan |

## Current Execution Wave
Phase:
- P1
Wave:
- W1
Purpose:
- verify both branches
Covers requirements:
- R1
Verify:
- node -e "process.exit(0)"

## Verification Plan
| Group | Kind | Command |
|---|---|---|
| cache-hit | test | node -e "console.log('hit')" |
| cache-miss | test | node -e "console.log('miss')" |

## Verification Ledger
- none yet
`;

function cli(project, command, ...args) {
  return runCli(project.dir, command, "--legacy", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", ...args);
}

test("CLI and wrapper read Current Status before stale legacy mirrors", () => {
  const project = makeProject(baseRun.replace("## Current Status", "## Current Status\nCurrent gate: research\nExecution mode: auto\nBlockers: awaiting exact contract\nNext verify: inspect-source\nRecommended next command: inspect-source"));
  const status = cli(project, "status");
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Current gate: research/);
  const artifact = readRunArtifact({ dir: project.dir, run: ".quick-codex-flow/sample.md" });
  assert.equal(artifact.currentGate, "research");
  assert.equal(artifact.executionMode, "auto");
  assert.equal(artifact.recommendedNextCommand, "inspect-source");
  assert.equal(artifact.currentStatus.phase, "P1");
});

test("lean repair and doctor need no project or inactive delegation artifacts", () => {
  const project = makeProject(leanRun);
  for (const command of ["repair-run", "doctor-flow", "doctor-run"]) {
    const result = cli(project, command);
    assert.equal(result.status, 0, `${command}: ${result.stdout} ${result.stderr}`);
  }
  const state = fs.readFileSync(path.join(project.dir, ".quick-codex-flow/STATE.md"), "utf8");
  assert.doesNotMatch(state, /Current gate:|Current phase|Execution mode:/);
  assert.equal(fs.existsSync(path.join(project.dir, ".quick-codex-flow/PROJECT-ROADMAP.md")), false);
  assert.equal(fs.existsSync(path.join(project.dir, ".quick-codex-flow/BACKLOG.md")), false);
  assert.equal(fs.readFileSync(project.runPath, "utf8"), leanRun);
});

test("close-wave rejects a handwritten pass that omits a planned branch", () => {
  const project = makeProject(leanRun + "- 2026-01-01T00:00:00.000Z verify-wave P1/W1 `node -e \"console.log('hit')\"` -> pass (hit)\n");
  const result = cli(project, "close-wave", "--phase-done");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /machine evidence/);
});

test("all grouped checks close a lean wave and update only canonical state", () => {
  const project = makeProject(leanRun);
  const verified = cli(project, "verify-wave");
  assert.equal(verified.status, 0, verified.stderr);
  const closed = cli(project, "close-wave", "--phase-done");
  assert.equal(closed.status, 0, closed.stderr);
  const text = fs.readFileSync(project.runPath, "utf8");
  assert.match(text, /Current gate: done/);
  assert.match(text, /## History\n- .*P1\/W1 verified/);
  assert.doesNotMatch(text, /## (Resume Digest|Workflow State|Compact-Safe Summary|Wave Handoff)/);
  assert.equal(fs.existsSync(path.join(project.dir, ".quick-codex-flow/BACKLOG.md")), false);
  for (const command of ["status", "resume", "checkpoint-digest"]) {
    const result = cli(project, command);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Current gate: done/);
    assert.doesNotMatch(result.stdout, /unknown|auto-continue|Recommended next command|Wave Handoff/);
  }
});

test("verification receipts expire when dirty source, untracked source, or the plan changes", () => {
  for (const mutation of ["tracked", "untracked", "plan"]) {
    const project = makeProject(leanRun);
    fs.writeFileSync(path.join(project.dir, "source.js"), "export const value = 1;\n");
    assert.equal(spawnSync("git", ["init", "-q"], { cwd: project.dir }).status, 0);
    assert.equal(spawnSync("git", ["add", "source.js"], { cwd: project.dir }).status, 0);
    assert.equal(cli(project, "verify-wave").status, 0);
    if (mutation === "tracked") fs.appendFileSync(path.join(project.dir, "source.js"), "// changed\n");
    if (mutation === "untracked") fs.writeFileSync(path.join(project.dir, "other.js"), "// newly added source\n");
    if (mutation === "plan") fs.writeFileSync(project.runPath, fs.readFileSync(project.runPath, "utf8").replace("cache-hit | test", "cache-changed | test"));
    const closed = cli(project, "close-wave", "--phase-done");
    assert.notEqual(closed.status, 0, mutation);
    assert.match(closed.stderr, /stale|another wave/, mutation);
  }
});

test("preflight runs first, a shared build runs once, and a corrected retry supersedes failure", () => {
  const project = makeProject(leanRun.replace(/## Verification Plan[\s\S]*?## Verification Ledger/, `## Verification Plan
| Group | Kind | Command |
|---|---|---|
| branch-a | test | node check.cjs |
| shared-a | build | node -e "console.log('shared-build')" |
| infrastructure | preflight | node -e "console.log('ready')" |
| shared-b | build | node -e "console.log('shared-build')" |

## Verification Ledger`));
  const check = path.join(project.dir, "check.cjs");
  fs.writeFileSync(check, "process.exit(1)");
  const failed = cli(project, "verify-wave");
  assert.notEqual(failed.status, 0);
  assert.ok(failed.stdout.indexOf("ready") < failed.stdout.indexOf("shared-build"));
  assert.equal((failed.stdout.match(/Command or method: node -e "console.log\('shared-build'\)"/g) ?? []).length, 1);
  assert.notEqual(cli(project, "close-wave", "--phase-done").status, 0);
  fs.writeFileSync(check, "process.exit(0)");
  assert.equal(cli(project, "verify-wave").status, 0);
  const closed = cli(project, "close-wave", "--phase-done");
  assert.equal(closed.status, 0, closed.stderr);
  assert.match(fs.readFileSync(project.runPath, "utf8"), /-> fail/);
});

test("failed infrastructure preflight stops before a broad suite starts", () => {
  const project = makeProject(leanRun.replace("| cache-miss | test | node -e \"console.log('miss')\" |", "| infra | preflight | node -e \"process.exit(1)\" |"));
  const verified = cli(project, "verify-wave");
  assert.notEqual(verified.status, 0);
  assert.doesNotMatch(verified.stdout, /console.log\('hit'\)/);
});

test("legacy close-wave also requires every active verification command", () => {
  const project = makeProject(baseRun.replace("- initial ledger entry", "- 2026-01-01T00:00:00.000Z verify-wave P1/W1 `printf first-check` -> pass (first-check)"));
  const closed = cli(project, "close-wave");
  assert.notEqual(closed.status, 0);
  assert.match(closed.stderr, /every planned command.*second-check/);
});

test("source edits during verification cannot create a passing reusable receipt", () => {
  const project = makeProject(leanRun.replace(/## Verification Plan[\s\S]*?## Verification Ledger/, `## Verification Plan
| Group | Kind | Command |
|---|---|---|
| source-mutation | test | node -e "require('fs').appendFileSync('source.js', '// mutation')" |

## Verification Ledger`));
  fs.writeFileSync(path.join(project.dir, "source.js"), "// original\n");
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: project.dir }).status, 0);
  assert.equal(spawnSync("git", ["add", "source.js"], { cwd: project.dir }).status, 0);
  const result = cli(project, "verify-wave");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Source changed during verification/);
  assert.notEqual(cli(project, "close-wave", "--phase-done").status, 0);
});

test("Experience capture and optional delegation preserve lean current-state authority", () => {
  const project = makeProject(leanRun);
  const hookPath = path.join(project.dir, "hooks.txt");
  fs.writeFileSync(hookPath, "Relevant warning: preserve severity [id:lean-test col:test]\n");
  const captured = cli(project, "capture-hooks", "--input", hookPath);
  assert.equal(captured.status, 0, captured.stderr);
  const assigned = cli(project, "delegate-plan-check", "--focus", "verify the active contract");
  assert.equal(assigned.status, 0, assigned.stderr);
  const text = fs.readFileSync(project.runPath, "utf8");
  assert.match(text, /Current gate: plan-check/);
  assert.doesNotMatch(text, /## (Workflow State|Resume Digest|Compact-Safe Summary)/);
  const artifact = readRunArtifact({ dir: project.dir, run: ".quick-codex-flow/sample.md" });
  assert.equal(artifact.currentGate, "plan-check");
});
