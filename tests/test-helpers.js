import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..");
export const cliPath = path.join(repoRoot, "bin", "quick-codex.js");
export const wrapCliPath = path.join(repoRoot, "bin", "quick-codex-wrap.js");
export const codexShimPath = path.join(repoRoot, "bin", "codex-qc-shim.js");

function mergedTestEnv(envExtra = {}) {
  const env = {
    ...process.env,
    QUICK_CODEX_NO_UPDATE_CHECK: "1",
    ...envExtra
  };
  let hasConfiguredEngine = false;
  if (Object.prototype.hasOwnProperty.call(envExtra, "HOME")) {
    const experienceConfigPath = path.join(envExtra.HOME, ".experience", "config.json");
    try {
      const config = JSON.parse(fs.readFileSync(experienceConfigPath, "utf8"));
      hasConfiguredEngine = Boolean(config.serverBaseUrl && (config.serverAuthToken ?? config.server?.authToken));
    } catch {
      hasConfiguredEngine = false;
    }
  }
  const taskRouterExplicit = env.QUICK_CODEX_WRAP_ENABLE_TASK_ROUTER === "1" || Boolean(env.QUICK_CODEX_EXPERIENCE_URL);
  const modelRouterExplicit = env.QUICK_CODEX_WRAP_ENABLE_MODEL_ROUTER === "1" || Boolean(env.QUICK_CODEX_EXPERIENCE_URL);
  if (!taskRouterExplicit && !hasConfiguredEngine && env.QUICK_CODEX_WRAP_DISABLE_TASK_ROUTER == null) {
    env.QUICK_CODEX_WRAP_DISABLE_TASK_ROUTER = "1";
  }
  if (!modelRouterExplicit && !hasConfiguredEngine && env.QUICK_CODEX_WRAP_DISABLE_MODEL_ROUTER == null) {
    env.QUICK_CODEX_WRAP_DISABLE_MODEL_ROUTER = "1";
  }
  return env;
}

export function makeProject(runText, runName = "sample.md") {
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

export function makeLockProject(runText, runName = "sample-lock.md") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-codex-lock-cli-"));
  const flowDir = path.join(dir, ".quick-codex-flow");
  const lockDir = path.join(dir, ".quick-codex-lock");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, runName), runText, "utf8");
  fs.writeFileSync(path.join(flowDir, "STATE.md"), `# Quick Codex Flow State

Active run:
- none

Active lock:
- .quick-codex-lock/${runName}

Current gate:
- execute

Current phase / wave:
- P1 / S1

Execution mode:
- manual

Status:
- active
`, "utf8");
  return { dir, runPath: path.join(lockDir, runName) };
}

export function writeStateFile(dir, body) {
  const flowDir = path.join(dir, ".quick-codex-flow");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, "STATE.md"), body, "utf8");
}

export function runCli(projectDir, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(),
    encoding: "utf8"
  });
}

export function runCliWithEnv(projectDir, envExtra, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(envExtra),
    encoding: "utf8"
  });
}

export function runWrapCli(projectDir, ...args) {
  return spawnSync(process.execPath, [wrapCliPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(),
    encoding: "utf8"
  });
}

export function runWrapCliWithInput(projectDir, input, ...args) {
  return spawnSync(process.execPath, [wrapCliPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(),
    encoding: "utf8",
    input
  });
}

export function runWrapCliWithInputAndEnv(projectDir, envExtra, input, ...args) {
  return spawnSync(process.execPath, [wrapCliPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(envExtra),
    encoding: "utf8",
    input
  });
}

export function runWrapCliWithEnv(projectDir, envExtra, ...args) {
  return spawnSync(process.execPath, [wrapCliPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(envExtra),
    encoding: "utf8"
  });
}

export function runCodexShim(projectDir, ...args) {
  return spawnSync(process.execPath, [codexShimPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(),
    encoding: "utf8"
  });
}

export function runCodexShimWithEnv(projectDir, envExtra, ...args) {
  return spawnSync(process.execPath, [codexShimPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(envExtra),
    encoding: "utf8"
  });
}

export function runCodexShimWithInputAndEnv(projectDir, envExtra, input, ...args) {
  return spawnSync(process.execPath, [codexShimPath, ...args], {
    cwd: repoRoot,
    env: mergedTestEnv(envExtra),
    encoding: "utf8",
    input
  });
}

export const baseRun = `# Run: sample

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

## Project Alignment
- Project board: .quick-codex-flow/PROJECT-ROADMAP.md
- Milestone: M1
- Track: default
- Run class: feature
- Parent run: none

## Workflow State
- Current stage: execute
- Current gate: execute
- Next required transition: execute -> phase-close
- Current roadmap phase: P1
- Current roadmap phase status: in-progress
- Why blocked or not advancing: none

## Delegation State
- Research delegation: completed
- Plan-check delegation: completed
- Goal-audit delegation: idle
- Active delegated checkpoint: none
- Waiting on: none
- Main-agent rule: Do not advance past the active delegated checkpoint until the matching result is merged into this run artifact.

## Gray Area Register
| ID | Type | Question | Owner | Resolution path | Status |
|---|---|---|---|---|---|
| G1 | sample | no unresolved gray area remains | qc-flow | closed | resolved

## Delivery Roadmap
Roadmap goal:
- validate quick-codex command surface

Roadmap status:
- in-progress

Current roadmap phase:
- P1

| Phase | Status | Purpose | Depends on | Verification checkpoint |
|---|---|---|---|---|
| P1 | in-progress | validate the current execution wave and its handoff data | none | focused checks |

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
- Phase relation: same-phase
- Carry-forward invariants: preserve the current affected area and verify path
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: Experience Engine verdict is not recorded yet; fall back to the protocol baseline.
- Brain verdict source: not-recorded
- Suggested session action: \`/compact\` after reviewing this summary and resume payload.
- What to forget: broad chat recap that does not change the next safe move
- What must remain loaded: current phase / wave, next verify, and recommended next command
- Next verify: \`printf fallback\`
- Resume with: \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

## Wave Handoff
- Trigger: completed wave
- Source checkpoint: P1 / W1
- Next target: resume P1 / W1
- Phase relation: same-phase
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: Experience Engine verdict is not recorded yet; fall back to the protocol baseline.
- Brain verdict source: not-recorded
- Suggested session action: \`/compact\` after reviewing this summary and resume payload.
- Sealed decisions: current gate execute and the fallback verify remain the active route
- Carry-forward invariants: preserve the current affected area and verify path
- Expired context: none recorded beyond the artifact
- What to forget: broad chat recap that does not change the next safe move
- What must remain loaded: current phase / wave, next verify, and recommended next command
- Resume payload: \`Use $qc-flow and resume from .quick-codex-flow/sample.md.\`

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

## Discuss Register
| ID | Theme | Question | Options considered | Recommended | User answer / decision | Status |
|---|---|---|---|---|---|---|
| Q1 | scope | what is the smallest safe continuity contract for this sample run? | flow-only / lock-only / flow-plus-lock | flow-plus-lock | validate the flow artifact while keeping lock compatibility visible | resolved |

## Evidence Basis
- repo evidence: sample

## Research Pack
Answered questions:
- the sample fixture already encodes the continuity shape under test

## Research Delegation
Assignment:
- Resolve the repo-side facts that were blocking roadmap and planning.

Delegate status:
- completed

Worker prompt:
- \`Use $qc-flow and resume from .quick-codex-flow/sample.md. Work only as a blocking research worker and return concrete repo facts.\`

Expected artifact update:
- Research Pack + Gray Area Register + Evidence Basis

Result summary:
- repo facts and boundaries were captured before planning

Result verdict:
- pass

Recommended transition:
- research -> roadmap

## Decision Register
| ID | Decision | Why now | Revisit when | Status |
|---|---|---|---|---|
| D1 | keep the sample run on milestone M1 default track | the fixture only needs one delivery lane | the project introduces a second active delivery lane | active |

## Dependency Register
| ID | Scope | Depends on | Why | Risk if wrong | Status |
|---|---|---|---|---|---|
| DEP1 | sample-run | none | the fixture is self-contained | hidden coupling would make continuity assertions unreliable | clear |

## Verified Plan
Goal:
- validate the command surface with an execution-ready phase plan

| Phase | Status | Purpose | Covers requirements | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|
| P1 | in_progress | validate the current execution wave and its handoff data | R1 | none | phase close is recorded | focused checks |
| P2 | pending | validate the post-close handoff route | R1 | P1 | phase close is reviewed | focused checks |

## Waves
| Wave | Phase | Status | Change | Done when | Verify |
|---|---|---|---|---|---|
| W1 | P1 | in_progress | run verify commands | verification ledger is updated | \`printf first-check\`, \`printf second-check\` |

## Plan-Check Delegation
Assignment:
- Audit the active Verified Plan and prove that execution may start safely.

Delegate status:
- completed

Worker prompt:
- \`Use $qc-flow and resume from .quick-codex-flow/sample.md. Work only as a blocking plan-check worker and audit the Verified Plan.\`

Expected artifact update:
- Verified Plan + Workflow State + Resume Digest

Result summary:
- verified plan, boundaries, and verify path are explicit enough for execution

Result verdict:
- pass

Recommended transition:
- plan-check -> execute

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

## Goal-Backward Verification
Goal this checkpoint proves:
- the sample run remains resumable and verifiable through the current roadmap phase

Proof status:
- partial

| Check | Why it proves the goal | Evidence | Status |
|---|---|---|---|
| Resume continuity | resuming the sample run should not require guessing from chat memory | Resume Digest plus current verify path are explicit | partial |

## Goal-Audit Delegation
Assignment:
- Audit whether the current checkpoint truly proves the intended outcome before the run finishes.

Delegate status:
- idle

Worker prompt:
- none

Expected artifact update:
- Goal-Backward Verification + Latest Phase Close + Decision Register

Result summary:
- none

Result verdict:
- none

Recommended transition:
- phase-close -> done
`;

export const verifiedWaveRun = baseRun.replace("## Verification Ledger\n- initial ledger entry", `## Verification Ledger
- 2026-01-01T00:00:00.000Z verify-wave P1/W1 \`printf first-check\` -> pass (first-check)
- 2026-01-01T00:00:01.000Z regression-check P1/W1 \`printf fallback\` -> pass (fallback)`);

export const routedWaveRun = verifiedWaveRun.replace(/## Verified Plan[\s\S]*?## Plan-Check Delegation/, `## Verified Plan
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

## Plan-Check Delegation`).replace("## Session Risk", `## Next Wave Pack
- Target: P1 / W2
- Derived from: P1 / W1
- Phase relation: same-phase
- Compaction action: compact
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: Experience Engine verdict is not recorded yet; fall back to the protocol baseline.
- Brain verdict source: not-recorded
- Suggested session action: \`/compact\` after reviewing this summary and keeping the next-wave pack for P1 / W2.
- Wave goal: start the second wave cleanly
- Done when: W2 becomes the active execution wave
- Next verify: \`printf second-wave\`
- Carry-forward invariants: preserve the current affected area and verify path
- What to forget: W1 implementation chatter that is already in the artifact
- What must remain loaded: P1 / W2 goal, verify command, and recommended next command
- Resume payload: \`Use $qc-flow and resume from .quick-codex-flow/sample.md to review and execute P1 / W2.\`

## Session Risk`);

export const independentPhaseRun = verifiedWaveRun.replace(/## Verified Plan[\s\S]*?## Plan-Check Delegation/, `## Verified Plan
Goal:
- validate independent next phase routing

| Phase | Status | Purpose | Covers requirements | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|
| P1 | in_progress | finish current phase | R1 | none | phase close is recorded | focused checks |
| P2 | pending | start independent follow-up phase | R1 | none | follow-up phase is ready | reset checks |

## Waves
| Wave | Phase | Status | Change | Done when | Verify |
|---|---|---|---|---|---|
| W1 | P1 | in_progress | finish first phase | first phase closes | \`printf first-check\` |
| W1 | P2 | pending | start independent second phase | second phase is active | \`printf phase-two\` |

## Plan-Check Delegation`);

export const finalRoadmapRun = verifiedWaveRun.replace(/## Verified Plan[\s\S]*?## Plan-Check Delegation/, `## Verified Plan
Goal:
- validate feature roadmap completion

| Phase | Status | Purpose | Covers requirements | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|
| P1 | in_progress | complete the only planned phase | R1 | none | feature close is recorded | focused checks |

## Waves
| Wave | Phase | Status | Change | Done when | Verify |
|---|---|---|---|---|---|
| W1 | P1 | in_progress | finish the final roadmap wave | feature close is recorded | \`printf first-check\` |

## Plan-Check Delegation`);

export const baseLockRun = `# Run: sample-lock

## Requirement Baseline
Original goal:
- validate lock continuity parsing

Required outcomes:
- R1: doctor-run passes for the lock artifact

Affected area:
- sample lock artifact parsing

Protected boundaries:
- unrelated files

Constraints:
- keep the lock artifact compact

Out of scope:
- unrelated edits

Definition of done:
- lock continuity fields are readable and valid

## Phase List
| Phase | Status | Purpose | Covers requirements | Covers affected area | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|---|
| P1 | in_progress | validate lock artifact continuity | R1 | sample lock artifact parsing | none | doctor-run passes | \`printf lock-verify\` |

## Preflight Summary
Upstream artifact:
- none

Evidence basis:
- repo evidence: canonical lock artifact shape

Preflight decision:
- ready-to-lock

## Locked Plan
Goal: validate lock continuity parsing
Current gate: execute
Execution mode: manual
Phase: P1
Phase purpose: validate the lock bridge fields
Covers requirements: R1
Affected area: sample lock artifact parsing
Protected boundaries: unrelated files
Scope: sample lock artifact only
Out of scope: unrelated edits
Evidence basis: repo evidence: canonical lock artifact shape
Lock rule: No scope expansion without relock.
Status: active

| Step | Status | Change | Done when | Verify |
|---|---|---|---|---|
| S1 | in_progress | validate the canonical lock shape | doctor-run accepts the lock artifact | \`printf lock-verify\` |

Current step: S1
Current verify:
- \`printf lock-verify\`

Recommended next command:
- \`Use $qc-lock for this task: resume from .quick-codex-lock/sample-lock.md.\`

Invariant requirements:
- R1

Invariant affected area:
- sample lock artifact parsing only

Blockers:
- none

Risks:
- none

Experience inputs:
- none

Verification evidence:
- \`printf lock-verify\` -> pass during fixture setup review

Requirements still satisfied:
- R1

Assumptions:
- none

## Verification Ledger
- 2026-01-01T00:00:00.000Z lock-check P1/S1 \`printf lock-verify\` -> pass (lock-verify)

## Blockers
- none

## Relock History
- v1: initial lock
`;

export const legacyHeadingLockRun = baseLockRun.replace("## Locked Plan", "## Current Locked Plan");
export const completedLockRun = baseLockRun
  .replace("Status: active", "Status: done")
  .replace("| S1 | in_progress | validate the canonical lock shape | doctor-run accepts the lock artifact | `printf lock-verify` |", "| S1 | done | validate the canonical lock shape | doctor-run accepts the lock artifact | `printf lock-verify` |");
