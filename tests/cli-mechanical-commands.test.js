import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "quick-codex.js");

function makeProject(runText, runName = "sample.md") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-cli-"));
  const flowDir = path.join(dir, ".quick-codex-flow");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, runName), runText, "utf8");
  fs.writeFileSync(path.join(flowDir, "STATE.md"), `# Quick Codex Flow State

Active run:
- .quick-codex-flow/${runName}

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`, "utf8");
  return { dir, runPath: path.join(flowDir, runName) };
}

function runCli(projectDir, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8"
  });
}

const baseRun = `# Run: sample

## Requirement Baseline
Original goal:
- validate quick-codex command surface

Required outcomes:
- R1: pass lock-check

Out of scope:
- unrelated edits

Affected area / blast radius:
- sample artifact parsing

Current gate:
- execute

Execution mode:
- manual

## Resume Digest
- Goal: validate quick-codex command surface
- Execution mode: manual
- Current gate: execute
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`printf fallback\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

## Compact-Safe Summary
- Goal: validate quick-codex command surface
- Current gate: execute
- Current phase / wave: P1 / W1
- Requirements still satisfied: R1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`printf fallback\`
- Resume with: \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

## Session Risk
- low
Why:
- small sample

## Context Risk
- low
Why:
- small sample

## Burn Risk
- low
Why:
- small sample

## Stall Status
- none
Last stalled step:
- none
Next smaller check:
- none

## Approval Strategy
- local-only
Current reason:
- local command verification
If blocked:
- stop

## Experience Snapshot
Active warnings:
- none
Why:
- none
Decision impact:
- none
Experience constraints:
- none
Active hook-derived invariants:
- none
Still relevant:
- none
Ignored warnings:
- none

## Clarify State
Goal:
- validate quick-codex command surface

Gray-area triggers:
- none

## Evidence Basis
- repo evidence: sample

## Current Execution Wave
Phase:
- P1
Wave:
- W1
Purpose:
- run verify commands
Covers requirements:
- R1
Verify:
- \`printf first-check\`
- \`printf second-check\`

## Current Status
Current phase: P1
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

## Verification Ledger
- initial ledger entry

## Blockers
- none

## Requirements Still Satisfied
- R1
`;

const verifiedWaveRun = baseRun.replace("## Verification Ledger\n- initial ledger entry", `## Verification Ledger
- 2026-01-01T00:00:00.000Z verify-wave P1/W1 \`printf first-check\` -> pass (first-check)
- 2026-01-01T00:00:01.000Z regression-check P1/W1 \`printf fallback\` -> pass (fallback)`);

const routedWaveRun = verifiedWaveRun.replace("## Current Execution Wave", `## Verified Plan
Goal:
- validate routing

| Phase | Status | Purpose | Covers requirements | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|
| P1 | in_progress | route between waves | R1 | none | W2 is ready after W1 closes | focused checks |

## Waves
| Wave | Phase | Status | Change | Done when | Verify |
|---|---|---|---|---|---|
| W1 | P1 | in_progress | finish first wave | first wave closes | \`printf first-check\` |
| W2 | P1 | pending | start second wave | second wave is active | \`printf second-wave\` |

## Current Execution Wave`);

test("lock-check passes when affected area, exclusions, evidence, and verify path are explicit", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "lock-check", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: Affected area explicit/);
  assert.match(result.stdout, /Lock-check passed\./);
});

test("lock-check fails when a gray-area trigger is still active", () => {
  const project = makeProject(
    baseRun.replace("## Clarify State\nGoal:\n- validate quick-codex command surface\n\nGray-area triggers:\n- none", "## Clarify State\nGoal:\n- validate quick-codex command surface\n\nGray-area triggers:\n- G1: verify path is still uncertain")
  );
  const result = runCli(project.dir, "lock-check", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /lock-check found one or more lock-readiness gaps/);
});

test("verify-wave executes active verify commands and appends bounded evidence to the ledger", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "verify-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /verify-wave P1\/W1 `printf first-check` -> pass/);
  assert.match(updated, /verify-wave P1\/W1 `printf second-check` -> pass/);
});

test("verify-wave replaces a placeholder verification ledger with real evidence", () => {
  const project = makeProject(baseRun.replace("- initial ledger entry", "- none yet"));
  const result = runCli(project.dir, "verify-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.doesNotMatch(updated, /## Verification Ledger[\s\S]*- none yet/);
  assert.match(updated, /verify-wave P1\/W1 `printf first-check` -> pass/);
  assert.match(updated, /verify-wave P1\/W1 `printf second-check` -> pass/);
});

test("regression-check falls back to Next verify when no active wave verify commands exist", () => {
  const noWaveVerifyRun = baseRun.replace(/## Current Execution Wave[\s\S]*?## Current Status/, `## Current Execution Wave
Phase:
- P1
Wave:
- W1
Purpose:
- no explicit verify list
Covers requirements:
- R1

## Current Status`);
  const project = makeProject(noWaveVerifyRun);
  const result = runCli(project.dir, "regression-check", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /regression-check P1\/W1 `printf fallback` -> pass/);
});

test("regression-check falls back to Latest Phase Close verification before Next verify", () => {
  const noWaveVerifyRun = baseRun.replace(/Verify:\n- `printf first-check`\n- `printf second-check`\n/, "");
  const withPhaseClose = noWaveVerifyRun.replace("## Current Status", `## Latest Phase Close
Phase: P0
Result:
- prior phase verified
Requirements covered:
- R0
Verification completed:
- verify-wave P0/W9 \`printf phase-close-check\` -> pass
- verify-wave P0/W9 \`printf phase-close-second\` -> pass
Requirements still satisfied:
- R0
Carry-forward notes:
- keep protected boundaries covered
Open risks:
- none
Decision:
- next-phase-ready
Why:
- bounded commands exist

## Current Status`);
  const project = makeProject(withPhaseClose);
  const result = runCli(project.dir, "regression-check", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /regression-check P1\/W1 `printf phase-close-check` -> pass/);
  assert.match(updated, /regression-check P1\/W1 `printf phase-close-second` -> pass/);
  assert.doesNotMatch(updated, /regression-check P1\/W1 `printf fallback` -> pass/);
});

test("close-wave marks the active wave done when verification evidence exists", () => {
  const project = makeProject(verifiedWaveRun);
  const result = runCli(project.dir, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Current Status[\s\S]*Execution state: done/);
  assert.match(updated, /- Current gate: execute/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to lock the next wave after P1 \/ W1\./);
});

test("close-wave routes to the next same-phase wave when Verified Plan already defines it", () => {
  const project = makeProject(routedWaveRun);
  const result = runCli(project.dir, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Current Status[\s\S]*Current wave: W2[\s\S]*Execution state: pending/);
  assert.match(updated, /## Current Execution Wave[\s\S]*Wave:\n- W2/);
  assert.match(updated, /## Current Execution Wave[\s\S]*Verify:\n- `printf second-wave`/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to review and execute P1 \/ W2\./);
});

test("close-wave fails when the active wave has no verification ledger evidence", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /close-wave requires at least one passing verification ledger entry for the active phase\/wave/);
});

test("close-wave --phase-done writes Latest Phase Close and moves the gate to phase-close", () => {
  const project = makeProject(verifiedWaveRun);
  const result = runCli(project.dir, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1", "--phase-done");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Latest Phase Close/);
  assert.match(updated, /Phase: P1/);
  assert.match(updated, /Decision:\n- next-phase-ready/);
  assert.match(updated, /- Current gate: phase-close/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to review the phase close for P1 and either start the next phase or mark the run done\./);
});
