import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  baseRun,
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
  assert.match(updated, /Phase Relation:\n- relock-before-next-phase/);
  assert.match(updated, /What must remain loaded:\n- Phase relation relock-before-next-phase, requirements still satisfied, and the next recommended command\./);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: relock-first/);
  assert.match(updated, /## Compact-Safe Summary[\s\S]*- Suggested session action: Do not run `\/compact` or `\/clear` yet; relock from \.quick-codex-flow\/sample\.md before continuing\./);
  assert.match(updated, /## Wave Handoff[\s\S]*- Trigger: phase close/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Brain session-action verdict: relock-first/);
  assert.match(updated, /## Wave Handoff[\s\S]*- Suggested session action: Do not run `\/compact` or `\/clear` yet; relock from \.quick-codex-flow\/sample\.md before continuing\./);
  assert.match(updated, /Decision:\n- next-phase-ready/);
  assert.match(updated, /- Current gate: phase-close/);
  assert.match(updated, /- Recommended next command: Use \$qc-flow and resume from \.quick-codex-flow\/sample\.md to review the phase close for P1 and either start the next phase or mark the run done\./);
});

test("init scaffolds a sample flow artifact that passes doctor-run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-init-"));
  const initResult = runCli(dir, "init", "--dir", dir);
  assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "sample-run.md")), true);
  assert.equal(fs.existsSync(path.join(dir, ".quick-codex-flow", "STATE.md")), true);
  const doctorResult = runCli(dir, "doctor-run", "--dir", dir, "--run", ".quick-codex-flow/sample-run.md");
  assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
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
  assert.match(repaired, /## Compact-Safe Summary/);
  assert.match(repaired, /## Compact-Safe Summary[\s\S]*- Brain session-action verdict: allow-compact/);
  assert.match(repaired, /## Compact-Safe Summary[\s\S]*- Suggested session action: `\/compact` after reviewing this summary and resume payload\./);
  assert.match(repaired, /## Wave Handoff/);
  assert.match(repaired, /## Wave Handoff[\s\S]*- Brain session-action verdict: allow-compact/);
  assert.match(repaired, /## Wave Handoff[\s\S]*- Suggested session action: `\/compact` after reviewing this summary and resume payload\./);
  assert.match(repaired, /## Experience Snapshot/);
  const state = fs.readFileSync(path.join(flowDir, "STATE.md"), "utf8");
  assert.match(state, /Active run:\n- \.quick-codex-flow\/stale-flow\.md/);
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
