import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  baseRun,
  finalRoadmapRun,
  independentPhaseRun,
  makeProject,
  routedWaveRun,
  runCli,
  runCliWithEnv,
  verifiedWaveRun,
  writeStateFile
} from "./test-helpers.js";

test("lock-check passes when affected area, exclusions, evidence, and verify path are explicit", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "lock-check", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("lock-check fails when a gray-area trigger is still active", () => {
  const project = makeProject(
    baseRun.replace("## Clarify State\nGoal:\n- validate quick-codex command surface\n\nGray-area triggers:\n- none", "## Clarify State\nGoal:\n- validate quick-codex command surface\n\nGray-area triggers:\n- G1: verify path is still uncertain")
  );
  const result = runCli(project.dir, "lock-check", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.notEqual(result.status, 0);
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
  const result = runCliWithEnv(project.dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "relock-first",
      confidence: "high",
      rationale: "The next wave is not locked yet, so keep the session and relock before any compaction decision."
    })
  }, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Current Status[\s\S]*Execution state: done/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: relock-first/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain verdict rationale: The next wave is not locked yet, so keep the session and relock before any compaction decision\./);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Suggested session action: Do not run `\/compact` or `\/clear` yet; relock from \.quick-codex-flow\/sample\.md before continuing\./);
  assert.match(updated, /## Wave Handoff[\s\S]*- Brain session-action verdict: relock-first/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Suggested session action: Do not run `\/compact` or `\/clear` yet; relock from \.quick-codex-flow\/sample\.md before continuing\./);
  assert.match(updated, /- Current gate: execute/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to lock the next wave after P1 \/ W1\./);
});

test("close-wave routes to the next same-phase wave when Verified Plan already defines it", () => {
  const project = makeProject(routedWaveRun);
  const result = runCliWithEnv(project.dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "allow-compact",
      confidence: "high",
      rationale: "The next-wave pack is explicit, so compacting after the summary is safe."
    })
  }, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Current Status[\s\S]*Current wave: W2[\s\S]*Execution state: pending/);
  assert.match(updated, /## Current Execution Wave[\s\S]*Wave:\n- W2/);
  assert.match(updated, /## Current Execution Wave[\s\S]*Verify:\n- `printf second-wave`/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: allow-compact/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Suggested session action: `\/compact` after reviewing this summary and keeping the next-wave pack for P1 \/ W2\./);
  assert.match(updated, /## Wave Handoff[\s\S]*- Brain session-action verdict: allow-compact/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Suggested session action: `\/compact` after reviewing this summary and keeping the next-wave pack for P1 \/ W2\./);
  assert.match(updated, /## Next Wave Pack/);
  assert.match(updated, /Target:\n- P1 \/ W2/);
  assert.match(updated, /Compaction action:\n- compact/);
  assert.match(updated, /Brain session-action verdict:\n- allow-compact/);
  assert.match(updated, /Suggested session action:\n- `\/compact` after reviewing this summary and keeping the next-wave pack for P1 \/ W2\./);
  assert.match(updated, /Next verify:\n- `printf second-wave`/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to review and execute P1 \/ W2\./);
});

test("close-wave fails when the active wave has no verification ledger evidence", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.notEqual(result.status, 0);
});

test("close-wave --phase-done writes Latest Phase Close and moves the gate to phase-close", () => {
  const project = makeProject(verifiedWaveRun);
  const result = runCliWithEnv(project.dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "relock-first",
      confidence: "high",
      rationale: "Phase close requires relock before any session action."
    })
  }, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1", "--phase-done");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Latest Phase Close/);
  assert.match(updated, /Phase: P1/);
  assert.match(updated, /Phase Relation:\n- dependent-next-phase/);
  assert.match(updated, /What must remain loaded:\n- Phase relation dependent-next-phase, requirements still satisfied, and the next recommended command\./);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: relock-first/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Suggested session action: Do not run `\/compact` or `\/clear` yet; relock from \.quick-codex-flow\/sample\.md before continuing\./);
  assert.match(updated, /## Wave Handoff[\s\S]*- Trigger: phase close/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Brain session-action verdict: relock-first/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Suggested session action: Do not run `\/compact` or `\/clear` yet; relock from \.quick-codex-flow\/sample\.md before continuing\./);
  assert.match(updated, /Decision:\n- next-phase-ready/);
  assert.match(updated, /- Current gate: phase-close/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to review the phase close for P1 and either start the next phase or mark the run done\./);
});

test("close-wave --phase-done derives clear-style handoff when the next phase is independent", () => {
  const project = makeProject(independentPhaseRun);
  const result = runCliWithEnv(project.dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "allow-clear",
      confidence: "high",
      rationale: "The next phase is independent, so clearing after recording the summary is safe."
    })
  }, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1", "--phase-done");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /\| P1 \| done \| finish current phase \| R1 \| none \| phase close is recorded \| focused checks \|/);
  assert.match(updated, /## Latest Phase Close[\s\S]*Phase Relation:\n- independent-next-phase/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Phase relation: independent-next-phase/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Compaction action: clear/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: allow-clear/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Suggested session action: `\/clear` only after this summary is recorded and the next phase is confirmed independent\./);
  assert.match(updated, /## Wave Handoff[\s\S]*- Phase relation: independent-next-phase/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Brain session-action verdict: allow-clear/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Suggested session action: `\/clear` only after this summary is recorded and the next phase is confirmed independent\./);
});

test("close-wave --phase-done closes the feature when the roadmap has no later phases", () => {
  const project = makeProject(finalRoadmapRun);
  const result = runCliWithEnv(project.dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "allow-clear",
      confidence: "high",
      rationale: "The roadmap is complete, so the session can clear after the feature close is recorded."
    })
  }, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1", "--phase-done");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /Current gate:\n- done/);
  assert.match(updated, /\| P1 \| done \| complete the only planned phase \| R1 \| none \| feature close is recorded \| focused checks \|/);
  assert.match(updated, /## Latest Phase Close[\s\S]*Decision:\n- feature-complete/);
  assert.match(updated, /## Latest Feature Close/);
  assert.match(updated, /Roadmap status:\n- done/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Current gate: done/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Phase relation: independent-next-phase/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Compaction action: clear/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Trigger: feature close/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Next target: review completed feature close for P1/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to review the completed feature close and either archive the run or start a new feature\./);
  const doctorResult = runCli(project.dir, "doctor-run", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
});

test("init scaffolds a sample flow artifact that passes doctor-run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-init-"));
  const initResult = runCli(dir, "init", "--dir", dir);
  assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "sample-run.md")), true);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "STATE.md")), true);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "PROJECT-ROADMAP.md")), true);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "BACKLOG.md")), true);
  const doctorResult = runCli(dir, "doctor-run", "--dir", dir, "--run", ".quick-codex-flow/sample-run.md");
  assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
  const doctorProjectResult = runCli(dir, "doctor-project", "--dir", dir);
  assert.equal(doctorProjectResult.status, 0, doctorProjectResult.stderr || doctorProjectResult.stdout);
});

test("delegate-plan-check assigns a blocking delegated checkpoint and records the worker prompt", () => {
  const startingRun = baseRun
    .replace("- Plan-check delegation: completed", "- Plan-check delegation: idle")
    .replace("## Plan-Check Delegation\nAssignment:\n- Audit the active Verified Plan and prove that execution may start safely.\n\nDelegate status:\n- completed", "## Plan-Check Delegation\nAssignment:\n- Audit the active Verified Plan and prove that execution may start safely.\n\nDelegate status:\n- idle");
  const project = makeProject(startingRun);
  const result = runCli(project.dir, "delegate-plan-check", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--focus", "audit the active plan", "--scope", "P1 only");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Delegation State[\s\S]*- Plan-check delegation: assigned/);
  assert.match(updated, /## Delegation State[\s\S]*- Active delegated checkpoint: plan-check/);
  assert.match(updated, /## Workflow State[\s\S]*- Current stage: plan-check/);
  assert.match(updated, /## Plan-Check Delegation[\s\S]*Assignment:\n- audit the active plan/);
  assert.match(updated, /## Plan-Check Delegation[\s\S]*Worker prompt:\n- Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md\./);
});

test("complete-delegation records a completed result so execute can pass flow doctor", () => {
  const startingRun = baseRun
    .replace("- Plan-check delegation: completed", "- Plan-check delegation: assigned")
    .replace("## Plan-Check Delegation\nAssignment:\n- Audit the active Verified Plan and prove that execution may start safely.\n\nDelegate status:\n- completed", "## Plan-Check Delegation\nAssignment:\n- Audit the active Verified Plan and prove that execution may start safely.\n\nDelegate status:\n- assigned");
  const project = makeProject(startingRun);
  const completeResult = runCli(project.dir, "complete-delegation", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md", "--type", "plan-check", "--status", "completed", "--summary", "plan audited", "--verdict", "pass", "--recommended-transition", "plan-check -> execute");
  assert.equal(completeResult.status, 0, completeResult.stderr || completeResult.stdout);
  const doctorResult = runCli(project.dir, "doctor-flow", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md");
  assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Delegation State[\s\S]*- Plan-check delegation: completed/);
  assert.match(updated, /## Plan-Check Delegation[\s\S]*Result summary:\n- plan audited/);
  assert.match(updated, /## Plan-Check Delegation[\s\S]*Result verdict:\n- pass/);
});

test("doctor-flow fails when execute advances without a completed blocking plan-check delegation", () => {
  const startingRun = baseRun
    .replace("- Plan-check delegation: completed", "- Plan-check delegation: idle")
    .replace("## Plan-Check Delegation\nAssignment:\n- Audit the active Verified Plan and prove that execution may start safely.\n\nDelegate status:\n- completed", "## Plan-Check Delegation\nAssignment:\n- Audit the active Verified Plan and prove that execution may start safely.\n\nDelegate status:\n- idle");
  const project = makeProject(startingRun);
  const result = runCli(project.dir, "doctor-flow", "--dir", project.dir, "--run", ".quick-codex-flow/sample.md");
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Delegated checkpoints cleared before advancing past their gate/);
});

test("doctor-run without --run ignores a completed active lock and falls back to the active flow run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-done-lock-"));
  const flowDir = path.join(dir, ".quick-codex-flow");
  const lockDir = path.join(dir, ".quick-codex-lock");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, "flow.md"), baseRun, "utf8");
  fs.writeFileSync(path.join(lockDir, "lock.md"), `# Run: completed-lock

## Locked Plan
Current gate: execute
Phase: P1
Status: done
Current step: S1
Current verify:
- \`printf done\`

Recommended next command:
- \`done\`

Blockers:
- none

Requirements still satisfied:
- R1
`);
  writeStateFile(dir, `# Quick Codex Flow State

Active run:
- .quick-codex-flow/flow.md

Active lock:
- .quick-codex-lock/lock.md

Current gate:
- execute

Current phase / wave:
- P1 / W1

Execution mode:
- manual

Status:
- active
`);
  const result = runCli(dir, "doctor-run", "--dir", dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("repair-run backfills a stale flow artifact and realigns STATE.md", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-repair-flow-"));
  const flowDir = path.join(dir, ".quick-codex-flow");
  fs.mkdirSync(flowDir, { recursive: true });
  const staleFlow = `# Run: stale-flow

## Requirement Baseline
Original goal:
- repair a stale flow artifact

Required outcomes:
- R1: resumability fields are restored

Out of scope:
- unrelated edits

Affected area / blast radius:
- stale flow artifact

Current gate:
- execute

Execution mode:
- manual

## Burn Risk
- low
Why:
- small fixture

## Approval Strategy
- local-only
Current reason:
- fixture repair
If blocked:
- stop

## Current Status
Current phase: P1
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/stale-flow.md.\`

## Verification Ledger
- initial ledger entry
`;
  fs.writeFileSync(path.join(flowDir, "stale-flow.md"), staleFlow, "utf8");
  const repairResult = runCliWithEnv(dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "allow-compact",
      confidence: "medium",
      rationale: "The repaired flow still points to the same active wave, so compact is acceptable."
    })
  }, "repair-run", "--dir", dir, "--run", ".quick-codex-flow/stale-flow.md");
  assert.equal(repairResult.status, 0, repairResult.stderr || repairResult.stdout);
  const repaired = fs.readFileSync(path.join(flowDir, "stale-flow.md"), "utf8");
  assert.match(repaired, /## Resume Digest/);
  assert.match(repaired, /## Project Alignment/);
  assert.match(repaired, /## Discuss Register/);
  assert.match(repaired, /## Decision Register/);
  assert.match(repaired, /## Dependency Register/);
  assert.match(repaired, /## Goal-Backward Verification/);
  assert.match(repaired, /## Compact-Safe Summary/);
  assert.match(repaired, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: allow-compact/);
  assert.match(repaired, /## Compact-Safe Summary[\s\S]*- Suggested session action: `\/compact` after reviewing this summary and resume payload\./);
  assert.match(repaired, /## Wave Handoff/);
  assert.match(repaired, /## Wave Handoff[\s\S]*- Brain session-action verdict: allow-compact/);
  assert.match(repaired, /## Wave Handoff[\s\S]*- Suggested session action: `\/compact` after reviewing this summary and resume payload\./);
  assert.match(repaired, /## Experience Snapshot/);
  const state = fs.readFileSync(path.join(flowDir, "STATE.md"), "utf8");
  assert.match(state, /Active run:\n- \.quick-codex-flow\/stale-flow\.md/);
  assert.equal(fs.existsSync(path.join(flowDir, "PROJECT-ROADMAP.md")), true);
  assert.equal(fs.existsSync(path.join(flowDir, "BACKLOG.md")), true);
  const doctorResult = runCli(dir, "doctor-run", "--dir", dir, "--run", ".quick-codex-flow/stale-flow.md");
  assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
});

test("repair-run backfills a clear-style suggested session action from an independent-next-phase handoff", () => {
  const independentRun = baseRun
    .replace("- Phase relation: same-phase\n", "- Phase relation: independent-next-phase\n")
    .replace("- Suggested session action: `\\/compact` after reviewing this summary and resume payload.\n", "")
    .replace("- Next target: resume P1 / W1\n", "- Next target: P2 / W1\n")
    .replace("- Phase relation: same-phase\n", "- Phase relation: independent-next-phase\n")
    .replace("- Suggested session action: `\\/compact` after reviewing this summary and resume payload.\n", "")
    .replace("- Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample.md.`\n", "- Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample.md to start P2 / W1 after the independent reset.`\n");
  const project = makeProject(independentRun);
  const result = runCliWithEnv(project.dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "allow-clear",
      confidence: "high",
      rationale: "The next phase is independent, so clearing after recording the summary is safe."
    })
  }, "repair-run", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const repaired = fs.readFileSync(project.runPath, "utf8");
  assert.match(repaired, /## Compact-Safe Summary[\s\S]*- Phase relation: independent-next-phase/);
  assert.match(repaired, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: allow-clear/);
  assert.match(repaired, /## Compact-Safe Summary[\s\S]*- Suggested session action: `\/clear` only after this summary is recorded and the next phase is confirmed independent\./);
  assert.match(repaired, /## Wave Handoff[\s\S]*- Brain session-action verdict: allow-clear/);
  assert.match(repaired, /## Wave Handoff[\s\S]*- Suggested session action: `\/clear` only after this summary is recorded and the next phase is confirmed independent\./);
});

test("doctor-run fails when a flow artifact is missing Wave Handoff carry-forward fields", () => {
  const missingWaveHandoff = baseRun
    .replace(/\n## Wave Handoff[\s\S]*?\n## Session Risk/, "\n## Session Risk")
    .replace("- Phase relation: same-phase\n", "")
    .replace("- Carry-forward invariants: preserve the current affected area and verify path\n", "")
    .replace("- Suggested session action: `\\/compact` after reviewing this summary and resume payload.\n", "")
    .replace("- What to forget: broad chat recap that does not change the next safe move\n", "")
    .replace("- What must remain loaded: current phase / wave, next verify, and recommended next command\n", "");
  const project = makeProject(missingWaveHandoff);
  const result = runCli(project.dir, "doctor-run", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.notEqual(result.status, 0);
});

test("doctor-run reports a full handoff sufficiency score for a complete flow artifact", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "doctor-run", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("doctor-flow validates workflow state, gray-area discipline, and delivery roadmap for a flow artifact", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "doctor-flow", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: Project Alignment/);
  assert.match(result.stdout, /PASS: Workflow State/);
  assert.match(result.stdout, /PASS: Gray Area Register/);
  assert.match(result.stdout, /PASS: Delivery Roadmap/);
});

test("sync-project updates the project roadmap active run register from a flow artifact", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "sync-project", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const roadmap = fs.readFileSync(path.join(project.dir, ".quick-codex-flow", "PROJECT-ROADMAP.md"), "utf8");
  assert.match(roadmap, /\.quick-codex-flow\/sample\.md/);
  assert.match(roadmap, /\| M1 \| active \| validate quick-codex command surface \| \.quick-codex-flow\/sample\.md \| none \| `printf fallback` \|/);
});

test("doctor-run fails when unresolved gray areas survive into execute", () => {
  const project = makeProject(baseRun
    .replace("| G1 | sample | no unresolved gray area remains | qc-flow | closed | resolved", "| G1 | contract | API contract is still ambiguous | qc-flow | research | ask-user"));
  const result = runCli(project.dir, "doctor-run", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /FAIL: Gray areas cleared before roadmap\/plan\/execute/);
});

test("resume surfaces preferred auto-continue commands for flow artifacts", () => {
  const project = makeProject(baseRun);
  const result = runCli(project.dir, "resume", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Auto-continue first:/);
  assert.match(result.stdout, /quick-codex-wrap auto --dir/);
  assert.match(result.stdout, /codex --qc-auto --qc-dir/);
});

test("close-wave persists brain-guided next-wave pack fields for later checkpoint-digest output", () => {
  const project = makeProject(routedWaveRun);
  const closeResult = runCliWithEnv(project.dir, {
    QUICK_CODEX_SESSION_ACTION_BRAIN_FIXTURE: JSON.stringify({
      verdict: "allow-compact",
      confidence: "high",
      rationale: "The next-wave pack is explicit, so compacting after the summary is safe."
    })
  }, "close-wave", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir, "--phase", "P1", "--wave", "W1");
  assert.equal(closeResult.status, 0, closeResult.stderr || closeResult.stdout);
  const updated = fs.readFileSync(project.runPath, "utf8");
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: allow-compact/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain verdict rationale: The next-wave pack is explicit, so compacting after the summary is safe\./);
  assert.match(updated, /## Next Wave Pack[\s\S]*Brain session-action verdict:\n- allow-compact/);
  assert.match(updated, /## Next Wave Pack[\s\S]*Brain verdict rationale:\n- The next-wave pack is explicit, so compacting after the summary is safe\./);
  assert.match(updated, /## Next Wave Pack[\s\S]*Suggested session action:\n- `\/compact` after reviewing this summary and keeping the next-wave pack for P1 \/ W2\./);
});

test("doctor-run fails when a same-phase routed handoff is missing the next-wave pack", () => {
  const routedWithoutPack = routedWaveRun
    .replace("Current phase / wave: P1 / W1", "Current phase / wave: P1 / W2")
    .replace("Execution state: in_progress", "Execution state: pending")
    .replace("Current wave: W1", "Current wave: W2")
    .replace("Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample.md.`", "Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample.md to review and execute P1 / W2.`")
    .replace("Next target: resume P1 / W1", "Next target: P1 / W2");
  const project = makeProject(routedWithoutPack);
  const result = runCli(project.dir, "doctor-run", "--run", ".quick-codex-flow/sample.md", "--dir", project.dir);
  assert.notEqual(result.status, 0);
});
