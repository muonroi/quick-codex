import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  baseLockRun,
  baseRun,
  completedLockRun,
  legacyHeadingLockRun,
  makeLockProject,
  repoRoot,
  runCli,
  runCliWithEnv,
  writeStateFile
} from "./test-helpers.js";

test("doctor-run passes for the canonical qc-lock artifact shape", () => {
  const project = makeLockProject(baseLockRun);
  const result = runCli(project.dir, "doctor-run", "--run", ".quick-codex-lock/sample-lock.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("doctor-run accepts the legacy qc-lock heading during migration", () => {
  const project = makeLockProject(legacyHeadingLockRun);
  const result = runCli(project.dir, "doctor-run", "--run", ".quick-codex-lock/sample-lock.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("doctor-run stays clean for a completed lock artifact when STATE.md has no active lock pointer", () => {
  const project = makeLockProject(completedLockRun);
  fs.writeFileSync(path.join(project.dir, ".quick-codex-flow", "STATE.md"), `# Quick Codex Flow State

Active run:
- .quick-codex-flow/paired-flow.md

Current gate:
- done

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- done
`, "utf8");
  const result = runCli(project.dir, "doctor-run", "--run", ".quick-codex-lock/sample-lock.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("doctor-run without --run prefers the active lock pointer over the active flow pointer", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-priority-"));
  const flowDir = path.join(dir, ".quick-codex-flow");
  const lockDir = path.join(dir, ".quick-codex-lock");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, "flow.md"), "# Run: broken-flow\n\n## Requirement Baseline\nOriginal goal:\n- broken flow artifact\n", "utf8");
  fs.writeFileSync(path.join(lockDir, "lock.md"), baseLockRun, "utf8");
  writeStateFile(dir, `# Quick Codex Flow State

Active run:
- .quick-codex-flow/flow.md

Active lock:
- .quick-codex-lock/lock.md

Current gate:
- execute

Current phase / wave:
- P1 / S1

Execution mode:
- manual

Status:
- active
`);
  const result = runCli(dir, "doctor-run", "--dir", dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("repair-run for a lock artifact preserves Active run and refreshes Active lock", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-repair-lock-"));
  const flowDir = path.join(dir, ".quick-codex-flow");
  const lockDir = path.join(dir, ".quick-codex-lock");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, "flow.md"), baseRun, "utf8");
  fs.writeFileSync(path.join(lockDir, "lock.md"), baseLockRun, "utf8");
  writeStateFile(dir, `# Quick Codex Flow State

Active run:
- .quick-codex-flow/flow.md

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`);
  const repairResult = runCli(dir, "repair-run", "--dir", dir, "--run", ".quick-codex-lock/lock.md");
  assert.equal(repairResult.status, 0, repairResult.stderr || repairResult.stdout);
  const state = fs.readFileSync(path.join(flowDir, "STATE.md"), "utf8");
  assert.match(state, /Active run:\n- \.quick-codex-flow\/flow\.md/);
  assert.match(state, /Active lock:\n- \.quick-codex-lock\/lock\.md/);
  const resolvedDoctor = runCli(dir, "doctor-run", "--dir", dir);
  assert.equal(resolvedDoctor.status, 0, resolvedDoctor.stderr || resolvedDoctor.stdout);
});

test("verify-wave blocks shell-style verify commands unless explicit opt-in is provided", () => {
  const shellRun = `# Run: shell-lock

## Requirement Baseline
Original goal:
- block shell verify by default

Affected area / blast radius:
- verify parser

Current gate:
- execute

Execution mode:
- manual

## Resume Digest
- Goal: block shell verify by default
- Execution mode: manual
- Current gate: execute
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`printf blocked > blocked.txt\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

## Compact-Safe Summary
- Goal: block shell verify by default
- Current gate: execute
- Current phase / wave: P1 / W1
- Requirements still satisfied: R1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`printf blocked > blocked.txt\`
- Resume with: \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

## Session Risk
- low
Why:
- fixture

## Context Risk
- low
Why:
- fixture

## Burn Risk
- low
Why:
- fixture

## Stall Status
- none
Last stalled step:
- none
Next smaller check:
- none

## Approval Strategy
- local-only
Current reason:
- fixture
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
- block shell verify by default

Gray-area triggers:
- none

## Evidence Basis
- repo evidence: shell guard

## Current Execution Wave
Phase:
- P1
Wave:
- W1
Purpose:
- exercise shell verify guard
Covers requirements:
- R1
Verify:
- \`printf blocked > blocked.txt\`

## Current Status
Current phase: P1
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

## Verification Ledger
- none yet

## Blockers
- none

## Requirements Still Satisfied
- R1
`;
  const project = makeLockProject(shellRun, "shell-flow.md");
  const flowPath = path.join(project.dir, ".quick-codex-flow", "shell-flow.md");
  fs.writeFileSync(flowPath, shellRun, "utf8");
  writeStateFile(project.dir, `# Quick Codex Flow State

Active run:
- .quick-codex-flow/shell-flow.md

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`);
  const blockedFile = path.join(project.dir, "blocked.txt");
  const result = runCli(project.dir, "verify-wave", "--run", ".quick-codex-flow/shell-flow.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(blockedFile), false);
  const updated = fs.readFileSync(flowPath, "utf8");
  assert.match(updated, /Blocked unsafe verify command:/);
});

test("verify-wave allows shell-style verify commands only with explicit opt-in", () => {
  const shellRun = baseRun.replace("Verify:\n- `printf first-check`\n- `printf second-check`", "Verify:\n- `printf shell-allowed > shell-allowed.txt`\n- `printf second-safe`");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-shell-allow-"));
  const flowDir = path.join(dir, ".quick-codex-flow");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, "sample.md"), shellRun, "utf8");
  writeStateFile(dir, `# Quick Codex Flow State

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
`);
  const allowedFile = path.join(dir, "shell-allowed.txt");
  const result = runCli(dir, "verify-wave", "--run", ".quick-codex-flow/sample.md", "--dir", dir, "--phase", "P1", "--wave", "W1", "--allow-shell-verify");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(allowedFile), true);
  assert.equal(fs.readFileSync(allowedFile, "utf8"), "shell-allowed");
});

test("install removes duplicate skill installs from the alternate discovery root", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-home-"));
  const agentsSkillsDir = path.join(homeDir, ".agents", "skills");
  const legacySkillsDir = path.join(homeDir, ".codex", "skills");
  fs.mkdirSync(agentsSkillsDir, { recursive: true });
  fs.mkdirSync(legacySkillsDir, { recursive: true });
  fs.mkdirSync(path.join(legacySkillsDir, "qc-flow"), { recursive: true });
  fs.mkdirSync(path.join(legacySkillsDir, "qc-lock"), { recursive: true });

  const result = runCliWithEnv(repoRoot, { HOME: homeDir }, "install", "--copy");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(agentsSkillsDir, "qc-flow")), true);
  assert.equal(fs.existsSync(path.join(agentsSkillsDir, "qc-lock")), true);
  assert.equal(fs.existsSync(path.join(legacySkillsDir, "qc-flow")), false);
  assert.equal(fs.existsSync(path.join(legacySkillsDir, "qc-lock")), false);
});

test("install to a custom target does not mutate discovery roots", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-home-custom-"));
  const customTarget = path.join(os.tmpdir(), `quick-codex-custom-${Date.now()}`);
  const agentsSkillsDir = path.join(homeDir, ".agents", "skills");
  const legacySkillsDir = path.join(homeDir, ".codex", "skills");
  fs.mkdirSync(path.join(agentsSkillsDir, "qc-flow"), { recursive: true });
  fs.mkdirSync(path.join(legacySkillsDir, "qc-lock"), { recursive: true });

  const result = runCliWithEnv(repoRoot, { HOME: homeDir }, "install", "--copy", "--target", customTarget);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(customTarget, "qc-flow")), true);
  assert.equal(fs.existsSync(path.join(customTarget, "qc-lock")), true);
  assert.equal(fs.existsSync(path.join(agentsSkillsDir, "qc-flow")), true);
  assert.equal(fs.existsSync(path.join(legacySkillsDir, "qc-lock")), true);
});
