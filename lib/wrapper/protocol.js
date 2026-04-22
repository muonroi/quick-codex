import fs from "node:fs";
import path from "node:path";

import { readActiveLockArtifact, readActiveRunArtifact, readRunArtifact } from "./run-file.js";

const FLOW_DIRNAME = ".quick-codex-flow";
const LOCK_DIRNAME = ".quick-codex-lock";
const STATE_FILENAME = "STATE.md";

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugifyTask(task) {
  const slug = String(task ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 10)
    .join("-");
  return slug || "task";
}

function uniqueRunRelativePath(dir, slug) {
  const baseDir = path.join(dir, FLOW_DIRNAME);
  let candidate = `${slug}.md`;
  let attempt = 2;
  while (fs.existsSync(path.join(baseDir, candidate))) {
    candidate = `${slug}-${attempt}.md`;
    attempt += 1;
  }
  return `${FLOW_DIRNAME}/${candidate}`;
}

function uniqueLockRelativePath(dir, slug) {
  const baseDir = path.join(dir, LOCK_DIRNAME);
  let candidate = `${slug}.md`;
  let attempt = 2;
  while (fs.existsSync(path.join(baseDir, candidate))) {
    candidate = `${slug}-${attempt}.md`;
    attempt += 1;
  }
  return `${LOCK_DIRNAME}/${candidate}`;
}

function writeFlowState({ dir, activeRun, currentGate, currentPhaseWave, executionMode, status = "active" }) {
  const statePath = path.join(dir, FLOW_DIRNAME, STATE_FILENAME);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const body = `# Quick Codex Flow State

Active run:
- ${activeRun}

Active lock:
- none

Current gate:
- ${currentGate}

Current phase / wave:
- ${currentPhaseWave}

Execution mode:
- ${executionMode}

Status:
- ${status}
`;
  fs.writeFileSync(statePath, body, "utf8");
}

function writeFlowLockState({
  dir,
  activeRun = "none",
  activeLock = "none",
  currentGate,
  currentPhaseWave,
  executionMode,
  status = "active"
}) {
  const statePath = path.join(dir, FLOW_DIRNAME, STATE_FILENAME);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const body = `# Quick Codex Flow State

Active run:
- ${activeRun}

Active lock:
- ${activeLock}

Current gate:
- ${currentGate}

Current phase / wave:
- ${currentPhaseWave}

Execution mode:
- ${executionMode}

Status:
- ${status}
`;
  fs.writeFileSync(statePath, body, "utf8");
}

function buildInitialRunFile({ task, relativeRunPath, executionMode }) {
  const resumeCommand = `Use $qc-flow and resume from ${relativeRunPath}. Continue at the active gate and keep the run artifact as source of truth.`;
  const compactAction = executionMode === "auto" ? "compact" : "compact";
  return `# Run: ${path.basename(relativeRunPath, ".md")}

## Requirement Baseline
Original goal:
- ${task}

Required outcomes:
- R1: clarify the real goal, success criteria, and protected boundaries before coding
- R2: research only the missing repo facts needed for safe planning
- R3: create and verify a plan before any execution wave begins

Constraints:
- enforce qc-flow front-half gates in passthrough mode
- do not execute code changes before plan-check passes

Out of scope:
- immediate coding without a verified plan

Definition of done:
- the run has a verified plan and only then enters execution safely

Affected area / blast radius:
- pending clarification from the active run

Current gate:
- clarify

Execution mode:
- ${executionMode}

## Workflow State
- Current stage: discuss
- Current gate: clarify
- Next required transition: discuss -> explore
- Current roadmap phase: none
- Current roadmap phase status: not-started
- Why blocked or not advancing: the task still needs explicit discuss, affected-area mapping, and roadmap creation before any phase plan or execution

## Delegation State
- Research delegation: idle
- Plan-check delegation: idle
- Goal-audit delegation: idle
- Active delegated checkpoint: none
- Waiting on: none
- Main-agent rule: Do not advance past the active delegated checkpoint until the matching result is merged into this run artifact.

## Gray Area Register
| ID | Type | Question | Owner | Resolution path | Status |
|---|---|---|---|---|---|
| G1 | user-intent | What exact success condition and exclusions should this run optimize for? | user + qc-flow | discuss | ask-user |
| G2 | affected-area | Which repo boundaries, contracts, and non-goals must stay protected? | qc-flow | explore | research |

## Delivery Roadmap
Roadmap goal:
- pending discuss and explore

Roadmap status:
- not-started

Current roadmap phase:
- none

Next roadmap checkpoint:
- capture discuss output, affected area, gray areas, and the first roadmap phases before phase planning

## Resume Digest
- Goal: ${task}
- Execution mode: ${executionMode}
- Current gate: clarify
- Current phase / wave: P1 / W0
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: keep qc-flow gates explicit in passthrough mode
- Next verify: confirm clarify output is specific enough to enter research or skip it with evidence
- Recommended next command: \`${resumeCommand}\`

## Compact-Safe Summary
- Goal: ${task}
- Current gate: clarify
- Current phase / wave: P1 / W0
- Requirements still satisfied: R1, R2, R3
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: no execution before a verified plan
- Phase relation: same-phase
- Compaction action: ${compactAction}
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: no brain verdict recorded for this run yet
- Brain verdict source: not-recorded
- Suggested session action: \`/compact\`
- Carry-forward invariants: keep the run artifact and current gate authoritative
- What to forget: speculative implementation ideas before research and plan-check
- What must remain loaded: current gate, required outcomes, and recommended next command
- Next verify: confirm clarify output is specific enough to enter research or skip it with evidence
- Resume with: \`${resumeCommand}\`

## Wave Handoff
- Trigger: planning checkpoint
- Source checkpoint: clarify bootstrap
- Next target: P1 / W0
- Phase relation: same-phase
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: no brain verdict recorded for this run yet
- Brain verdict source: not-recorded
- Suggested session action: \`/compact\`
- Sealed decisions: qc-flow front-half protocol is enforced before execution
- Carry-forward invariants: no execution before plan-check passes
- Expired context: none
- What to forget: speculative implementation ideas before research and plan-check
- What must remain loaded: current gate, required outcomes, and recommended next command
- Resume payload: \`${resumeCommand}\`

## Next Wave Pack
- Target: P1 / W0
- Derived from: clarify bootstrap
- Phase relation: same-phase
- Compaction action: ${compactAction}
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: no brain verdict recorded for this run yet
- Brain verdict source: not-recorded
- Suggested session action: \`/compact\`
- Wave goal: complete clarify, affected-area discussion, context sufficiency, and targeted research before planning
- Done when: the run either enters plan with evidence or records why no research gap remains
- Next verify: confirm clarify output is specific enough to enter research or skip it with evidence
- Carry-forward invariants: no execution before plan-check passes
- What to forget: speculative implementation ideas before research and plan-check
- What must remain loaded: current gate, required outcomes, and recommended next command
- Resume payload: \`${resumeCommand}\`

## Session Risk
- low
Why:
- fresh run bootstrap

## Context Risk
- low
Why:
- artifact is explicit even though the task is still broad

## Burn Risk
- low
Why:
- the run has not entered repeated verify or implementation loops yet

## Stall Status
- none
Last stalled step:
- none
Next smaller check:
- capture clarify output and research targets

## Approval Strategy
- local-only
Current reason:
- clarify and research only
If blocked:
- stop at clarify with one explicit question or repo gap

## Experience Snapshot
Active warnings:
- none
Why:
- no relevant Experience Engine warning is recorded in this run yet
Decision impact:
- none
Experience constraints:
- none
Active hook-derived invariants:
- no execution before plan-check passes
Still relevant:
- yes
Ignored warnings:
- none

## Clarify State
Goal:
- ${task}

Open questions:
- pending

Affected area / blast radius:
- pending

Context sufficiency:
- insufficient until clarify and targeted research are updated

Decision:
- pending

## Evidence Basis
- repo evidence: pending
- explicit research-skip rationale: none

## Research Pack
Pending targeted research.

## Research Delegation
Assignment:
- Research delegation has not been assigned yet.

Delegate status:
- idle

Worker prompt:
- none

Expected artifact update:
- Research Pack + Gray Area Register + Evidence Basis

Result summary:
- none

Result verdict:
- none

Recommended transition:
- research -> roadmap

## Verified Plan
Pending verified plan.

## Plan-Check Delegation
Assignment:
- Plan-check delegation has not been assigned yet.

Delegate status:
- idle

Worker prompt:
- none

Expected artifact update:
- Verified Plan + Workflow State + Resume Digest

Result summary:
- none

Result verdict:
- none

Recommended transition:
- plan-check -> execute

## Current Execution Wave
No execution wave is active until plan-check passes.

## Goal-Backward Verification
Goal this checkpoint proves:
- pending until the first execution checkpoint exists

Proof status:
- pending

| Check | Why it proves the goal | Evidence | Status |
|---|---|---|---|
| Checkpoint outcome | prove the run is closing the intended outcome rather than only local tasks | pending | pending |

## Goal-Audit Delegation
Assignment:
- Goal-audit delegation has not been assigned yet.

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

## Current Status
Current phase: P1
Current wave: W0
Execution state: pending

## Recommended Next Command
- \`${resumeCommand}\`

## Verification Ledger
- none yet

## Blockers
- none

## Requirements Still Satisfied
- R1
- R2
- R3

## Relock History
- v1: initial passthrough qc-flow bootstrap
`;
}

function createFlowRunArtifact({ dir, task, executionMode }) {
  const relativeRunPath = uniqueRunRelativePath(dir, slugifyTask(task));
  const absoluteRunPath = path.join(dir, relativeRunPath);
  fs.mkdirSync(path.dirname(absoluteRunPath), { recursive: true });
  fs.writeFileSync(absoluteRunPath, buildInitialRunFile({
    task: normalizeWhitespace(task),
    relativeRunPath,
    executionMode
  }), "utf8");
  writeFlowState({
    dir,
    activeRun: relativeRunPath,
    currentGate: "clarify",
    currentPhaseWave: "P1 / W0",
    executionMode,
    status: "active"
  });
  return readRunArtifact({ dir, run: relativeRunPath });
}

function meaningfulSection(section) {
  const normalized = normalizeWhitespace(section);
  if (!normalized) {
    return false;
  }
  const placeholders = [
    "pending verified plan.",
    "pending delivery roadmap.",
    "pending targeted research.",
    "no execution wave is active until plan-check passes."
  ];
  return !placeholders.includes(normalized.toLowerCase());
}

function meaningfulRoadmapSection(section) {
  const normalized = normalizeWhitespace(section);
  if (!normalized) {
    return false;
  }
  if (normalized.toLowerCase() === "pending delivery roadmap.") {
    return false;
  }
  return /\|\s*p\d+\s*\|/i.test(section);
}

function delegationStatus(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return ["idle", "required", "assigned", "completed", "blocked"].includes(normalized) ? normalized : null;
}

function pendingDelegation(artifact) {
  const state = artifact?.delegationState ?? {};
  const order = [
    normalizeWhitespace(state.activeCheckpoint).toLowerCase(),
    normalizeWhitespace(state.waitingOn).toLowerCase(),
    "research",
    "plan-check",
    "goal-audit"
  ];
  for (const type of order) {
    if (!["research", "plan-check", "goal-audit"].includes(type)) {
      continue;
    }
    const record = type === "research"
      ? artifact?.researchDelegation
      : type === "plan-check"
        ? artifact?.planCheckDelegation
        : artifact?.goalAuditDelegation;
    const fallback = type === "research" ? state.research : type === "plan-check" ? state.planCheck : state.goalAudit;
    const status = delegationStatus(record?.delegateStatus ?? fallback);
    if (status === "required" || status === "assigned") {
      return {
        type,
        status,
        workerPrompt: record?.workerPrompt ?? null
      };
    }
  }
  return null;
}

function effectiveFlowGate(artifact) {
  const declaredGate = artifact.currentGate ?? "clarify";
  const delegation = pendingDelegation(artifact);
  if (delegation?.type === "research" && !["clarify", "explore", "research"].includes(declaredGate)) {
    return {
      gate: "research",
      reason: "The run is blocked on a delegated research checkpoint and cannot advance beyond research until the result is merged."
    };
  }
  if ((declaredGate === "plan" || declaredGate === "plan-check" || declaredGate === "execute") && !meaningfulRoadmapSection(artifact.deliveryRoadmap)) {
    return {
      gate: "roadmap",
      reason: "Planning and execution are blocked because the run does not yet contain a meaningful Delivery Roadmap section."
    };
  }
  if (delegation?.type === "plan-check" && ["execute", "phase-close", "done"].includes(declaredGate)) {
    return {
      gate: "plan-check",
      reason: "Execution is blocked on a delegated plan-check checkpoint and cannot continue until the result is merged."
    };
  }
  if (declaredGate === "execute" && !meaningfulSection(artifact.verifiedPlan)) {
    return {
      gate: "plan-check",
      reason: "Execute is blocked because the run does not yet contain a meaningful Verified Plan section."
    };
  }
  if (delegation?.type === "goal-audit" && declaredGate === "done") {
    return {
      gate: "phase-close",
      reason: "Feature close is blocked on a delegated goal-audit checkpoint and cannot finish until the result is merged."
    };
  }
  return {
    gate: declaredGate,
    reason: "The current gate comes from the active run artifact."
  };
}

export function buildQcFlowProtocolPrompt({ artifact, task, gate, created = false, gateReason = null }) {
  const taskText = normalizeWhitespace(task);
  const artifactRun = artifact.relativeRunPath;
  const header = [
    "Wrapper route: qc-flow",
    "Protocol enforcement: passthrough qc-flow contract is active.",
    `Run artifact: ${artifactRun}`,
    `Current declared gate: ${artifact.currentGate ?? "clarify"}`,
    `Current enforced gate: ${gate}`,
    gateReason ? `Gate reason: ${gateReason}` : null,
    created ? "Artifact bootstrap: a task-specific qc-flow run was created before this turn." : null,
    "",
    `Task: ${taskText}`
  ].filter(Boolean);

  if (gate === "clarify" || gate === "research") {
    return [
      ...header,
      "",
      "Follow qc-flow strictly at the current front-half gate.",
      "Do not implement code, do not edit product files, and do not hand work to qc-lock yet.",
      "Update the active run artifact first:",
      "- Workflow State",
      "- Clarify State",
      "- Gray Area Register",
      "- affected area / blast radius",
      "- context sufficiency",
      "- Evidence Basis and Research Pack when repo facts are still missing",
      "Only move the run toward roadmap or plan when the missing context is supported by evidence.",
      "If any gray area remains unresolved, do not guess. Stay in explore/research and, when user input is still required, present at least 3 options for each gray area with one recommended option plus a free-text path.",
      "If the next safe move becomes explicit, continue automatically into the next qc-flow gate instead of stopping at a paste-only recommended command.",
      "Refresh Resume Digest, Compact-Safe Summary, Wave Handoff, Workflow State, and Recommended Next Command before ending the turn."
    ].join("\n");
  }

  if (gate === "roadmap") {
    return [
      ...header,
      "",
      "Stay in qc-flow roadmap mode.",
      "Do not execute implementation and do not narrow to qc-lock yet.",
      "Use the active run artifact to produce or verify:",
      "- Delivery Roadmap",
      "- roadmap phases, dependencies, and verification checkpoints",
      "- current roadmap phase and next required transition",
      "- explicit boundary between macro roadmap and phase-local planning",
      "Phase planning is allowed only after the roadmap is explicit and the current roadmap phase is chosen.",
      "If the next safe move becomes explicit, continue automatically into phase planning instead of stopping at a paste-only recommended command.",
      "Refresh Resume Digest, Compact-Safe Summary, Wave Handoff, Workflow State, and Recommended Next Command before ending the turn."
    ].join("\n");
  }

  if (gate === "plan" || gate === "plan-check") {
    return [
      ...header,
      "",
      "Stay in qc-flow planning mode.",
      "Do not execute implementation yet and do not narrow to qc-lock yet.",
      "If a delegated plan-check checkpoint is active, treat it as blocking. Do not bypass it, and do not continue to execute until its result is merged into the run artifact.",
      "Use the active run artifact to produce or verify:",
      "- Workflow State",
      "- current roadmap phase selection",
      "- Verified Plan",
      "- phase and wave decomposition",
      "- protected boundaries and verify path",
      "Execution is allowed only after the plan is explicitly verified and the artifact gate advances safely.",
      "If any gray area is still open, do not guess and do not execute. Route back to explore/research or ask the user with explicit options.",
      "If the next safe move becomes explicit, continue automatically into execution handoff instead of stopping at a paste-only recommended command.",
      "Refresh Resume Digest, Compact-Safe Summary, Wave Handoff, Workflow State, and Recommended Next Command before ending the turn."
    ].join("\n");
  }

  return [
    ...header,
    "",
    "Execution is now allowed because the run already passed the front-half gates.",
    "Use the active run artifact as the source of truth for the current wave.",
    "If a delegated checkpoint reopens, stop immediately and route back to the delegated gate instead of guessing or continuing optimistically.",
    "Stay within the declared execution scope, verify before advancing, and update the run artifact after the wave changes."
  ].join("\n");
}

export function enforceQcFlowProtocol({ dir, task, executionMode = "manual", activeArtifact = null }) {
  let artifact = activeArtifact ?? null;
  let created = false;
  if (!artifact) {
    const discovered = readActiveRunArtifact(dir)?.artifact ?? null;
    if (discovered) {
      artifact = discovered;
    } else {
      artifact = createFlowRunArtifact({ dir, task, executionMode });
      created = true;
    }
  }
  const gateState = effectiveFlowGate(artifact);
  return {
    artifact,
    created,
    effectiveGate: gateState.gate,
    gateReason: gateState.reason,
    prompt: buildQcFlowProtocolPrompt({
      artifact,
      task,
      gate: gateState.gate,
      created,
      gateReason: gateState.reason
    })
  };
}

function parseLockedPlanTable(section) {
  const lines = String(section ?? "").split(/\r?\n/);
  return lines
    .filter((line) => /^\|\s*S\d+\s*\|/i.test(line))
    .map((line) => line.split("|").map((part) => part.trim()))
    .map((parts) => ({
      id: parts[1] ?? "",
      status: parts[2] ?? "",
      change: parts[3] ?? "",
      doneWhen: parts[4] ?? "",
      verify: parts[5] ?? ""
    }))
    .filter((row) => row.id);
}

function lockedLineValue(section, label) {
  const normalized = String(section ?? "");
  const match = normalized.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

function firstMeaningfulStep(steps) {
  return steps.find((step) => step.status === "in_progress")
    ?? steps.find((step) => step.status === "pending")
    ?? steps[0]
    ?? null;
}

function buildStandaloneLockRunFile({ task, relativeRunPath, executionMode }) {
  const resumeCommand = `Use $qc-lock for this task: resume from ${relativeRunPath}.`;
  return `# Run: ${path.basename(relativeRunPath, ".md")}

## Requirement Baseline
Original goal:
- ${task}

Required outcomes:
- R1: complete a narrow, execution-ready change without scope drift

Affected area:
- pending short qc-lock preflight

Protected boundaries:
- keep all non-targeted repo areas unchanged

Constraints:
- do a short preflight before locking if upstream planning is not already trustworthy

Out of scope:
- broad repo exploration or multi-phase planning

Definition of done:
- the task has an explicit lock, the current step is verified, and scope stayed tight

## Phase List
| Phase | Status | Purpose | Covers requirements | Covers affected area | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|---|
| P1 | pending | narrow execution after short preflight | R1 | pending short qc-lock preflight | none | a locked step list exists and the first step is ready | targeted verify for the active step |

## Preflight Summary
Upstream artifact:
- none

Evidence basis:
- repo evidence: pending short qc-lock preflight

Preflight decision:
- keep-researching

## Locked Plan
Goal: ${task}
Current gate: preflight
Execution mode: ${executionMode}
Phase: P1
Phase purpose: prove the narrow execution scope before locking.
Covers requirements: R1
Affected area: pending short qc-lock preflight
Protected boundaries: keep all non-targeted repo areas unchanged
Scope: do not edit product files until the lock is explicit
Out of scope: broad exploration, broad planning, or unrelated refactors
Evidence basis: pending short qc-lock preflight
Lock rule: No scope expansion without relock.
Status: preflight

| Step | Status | Change | Done when | Verify |
|---|---|---|---|---|
| S1 | pending | complete short preflight and write the lock | affected area, protected boundaries, and verify path are explicit | targeted repo read-through |
| S2 | pending | execute the first locked change | the locked change lands without widening scope | targeted project verify |

Current step: S1
Current verify:
- targeted repo read-through

Recommended next command:
- ${resumeCommand}

Invariant requirements:
- R1

Invariant affected area:
- pending short qc-lock preflight

Blockers:
- none

Risks:
- locking too early from an unproven affected area

Experience inputs:
- none

Verification evidence:
- none yet

Requirements still satisfied:
- R1

Assumptions:
- the task can become execution-ready after a short preflight

## Verification Ledger
- none yet

## Blockers
- none

## Relock History
- v1: initial passthrough qc-lock bootstrap
`;
}

function buildLockRunFromFlowArtifact({ task, relativeRunPath, executionMode, flowArtifact }) {
  const resumeCommand = `Use $qc-lock for this task: resume from ${relativeRunPath}.`;
  const stepVerify = flowArtifact.nextWavePack.nextVerify
    ?? flowArtifact.compactSafeSummary.nextVerify
    ?? "targeted project verify";
  const phaseWave = flowArtifact.currentPhaseWave ?? "P1 / W1";
  const phaseId = phaseWave.split("/")[0]?.trim() ?? "P1";
  const stepId = "S1";
  const affectedArea = normalizeWhitespace(
    flowArtifact.clarifyState
      ? flowArtifact.clarifyState.split(/\r?\n/).slice(0, 6).join(" ")
      : flowArtifact.goal ?? task
  ) || "carry forward the qc-flow affected area only";
  const evidenceBasis = normalizeWhitespace(
    meaningfulSection(flowArtifact.verifiedPlan)
      ? flowArtifact.verifiedPlan
      : flowArtifact.researchPack
  ) || "trusted qc-flow verified plan";
  const executionScope = normalizeWhitespace(flowArtifact.currentExecutionWave)
    || `continue the execution scope already proven by ${flowArtifact.relativeRunPath}`;

  return `# Run: ${path.basename(relativeRunPath, ".md")}

## Requirement Baseline
Original goal:
- ${flowArtifact.goal ?? task}

Required outcomes:
- R1: execute only the wave already approved by the upstream qc-flow run

Affected area:
- ${affectedArea}

Protected boundaries:
- stay inside the upstream qc-flow verified-plan boundaries

Constraints:
- preserve the upstream qc-flow invariants while executing one locked step at a time

Out of scope:
- widening the wave beyond the upstream verified plan

Definition of done:
- the current locked step is verified and the lock artifact records the result

## Phase List
| Phase | Status | Purpose | Covers requirements | Covers affected area | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|---|
| ${phaseId} | in_progress | execute the current upstream-approved wave under qc-lock | R1 | upstream qc-flow affected area only | upstream qc-flow execute gate | the current locked step is verified | ${stepVerify} |

## Preflight Summary
Upstream artifact:
- ${flowArtifact.relativeRunPath}

Evidence basis:
- trusted upstream qc-flow run is already in execute with a meaningful Verified Plan

Preflight decision:
- ready-to-lock

## Locked Plan
Goal: ${flowArtifact.goal ?? task}
Current gate: execute
Execution mode: ${executionMode}
Phase: ${phaseId}
Phase purpose: execute the current upstream-approved wave without reopening planning.
Covers requirements: R1
Affected area: ${affectedArea}
Protected boundaries: stay inside the upstream qc-flow verified-plan boundaries
Scope: ${executionScope}
Out of scope: new planning, new phases, or unrelated refactors
Evidence basis: upstream qc-flow artifact ${flowArtifact.relativeRunPath}
Lock rule: No scope expansion without relock.
Status: active

| Step | Status | Change | Done when | Verify |
|---|---|---|---|---|
| ${stepId} | in_progress | execute the current approved wave without widening scope | the current execution wave lands and the verify path passes | ${stepVerify} |
| S2 | pending | refresh the lock artifact and decide whether a relock is needed | the artifact reflects the verified result and the next move is explicit | review the updated lock artifact |

Current step: ${stepId}
Current verify:
- ${stepVerify}

Recommended next command:
- ${resumeCommand}

Invariant requirements:
- R1

Invariant affected area:
- only the upstream qc-flow wave scope remains in scope

Blockers:
- none

Risks:
- widening the scope beyond the upstream verified plan

Experience inputs:
- none

Verification evidence:
- upstream qc-flow verified plan already exists in ${flowArtifact.relativeRunPath}

Requirements still satisfied:
- R1

Assumptions:
- the upstream qc-flow wave is still the correct execution target

## Verification Ledger
- none yet

## Blockers
- none

## Relock History
- v1: trusted handoff from ${flowArtifact.relativeRunPath}
`;
}

function createStandaloneLockArtifact({ dir, task, executionMode }) {
  const relativeRunPath = uniqueLockRelativePath(dir, slugifyTask(task));
  const absoluteRunPath = path.join(dir, relativeRunPath);
  fs.mkdirSync(path.dirname(absoluteRunPath), { recursive: true });
  fs.writeFileSync(absoluteRunPath, buildStandaloneLockRunFile({
    task: normalizeWhitespace(task),
    relativeRunPath,
    executionMode
  }), "utf8");
  writeFlowLockState({
    dir,
    activeRun: "none",
    activeLock: relativeRunPath,
    currentGate: "preflight",
    currentPhaseWave: "P1 / S1",
    executionMode,
    status: "active"
  });
  return readRunArtifact({ dir, run: relativeRunPath });
}

function createLockArtifactFromFlow({ dir, task, executionMode, flowArtifact }) {
  const relativeRunPath = uniqueLockRelativePath(dir, slugifyTask(task));
  const absoluteRunPath = path.join(dir, relativeRunPath);
  fs.mkdirSync(path.dirname(absoluteRunPath), { recursive: true });
  fs.writeFileSync(absoluteRunPath, buildLockRunFromFlowArtifact({
    task: normalizeWhitespace(task),
    relativeRunPath,
    executionMode,
    flowArtifact
  }), "utf8");
  writeFlowLockState({
    dir,
    activeRun: flowArtifact.relativeRunPath,
    activeLock: relativeRunPath,
    currentGate: "execute",
    currentPhaseWave: "P1 / S1",
    executionMode,
    status: "active"
  });
  return readRunArtifact({ dir, run: relativeRunPath });
}

function hasTrustedFlowHandoff(artifact) {
  return artifact
    && effectiveFlowGate(artifact).gate === "execute"
    && meaningfulSection(artifact.verifiedPlan);
}

function effectiveLockGate(artifact) {
  const declaredGate = artifact.currentGate ?? "preflight";
  const lockedPlan = artifact.lockedPlan ?? "";
  const steps = parseLockedPlanTable(lockedPlan);
  const currentStep = lockedLineValue(lockedPlan, "Current step");
  const status = lockedLineValue(lockedPlan, "Status");
  if (declaredGate === "execute" && (!currentStep || steps.length === 0 || !status || status === "preflight")) {
    return {
      gate: "preflight",
      reason: "Execute is blocked because the lock artifact does not yet contain an active locked step."
    };
  }
  return {
    gate: declaredGate,
    reason: "The current gate comes from the active lock artifact."
  };
}

export function buildQcLockProtocolPrompt({
  artifact,
  task,
  gate,
  created = false,
  gateReason = null,
  handoffArtifactRun = null
}) {
  const taskText = normalizeWhitespace(task);
  const lockedPlan = artifact.lockedPlan ?? "";
  const steps = parseLockedPlanTable(lockedPlan);
  const step = firstMeaningfulStep(steps);
  const currentStep = lockedLineValue(lockedPlan, "Current step") ?? step?.id ?? "S1";
  const currentVerify = lockedLineValue(lockedPlan, "Current verify") ?? step?.verify ?? "targeted project verify";
  const header = [
    "Wrapper route: qc-lock",
    "Protocol enforcement: passthrough qc-lock contract is active.",
    `Lock artifact: ${artifact.relativeRunPath}`,
    `Current declared gate: ${artifact.currentGate ?? "preflight"}`,
    `Current enforced gate: ${gate}`,
    handoffArtifactRun ? `Trusted upstream handoff: ${handoffArtifactRun}` : null,
    gateReason ? `Gate reason: ${gateReason}` : null,
    created ? "Artifact bootstrap: a task-specific qc-lock run was created before this turn." : null,
    "",
    `Task: ${taskText}`
  ].filter(Boolean);

  if (gate === "preflight") {
    return [
      ...header,
      "",
      "Do a short qc-lock preflight before writing product changes.",
      "Update the lock artifact first:",
      "- Preflight Summary",
      "- affected area and protected boundaries",
      "- explicit verify path",
      "- Locked Plan with 3 to 7 short steps",
      "Do not execute product changes until the preflight decision is ready-to-lock and the current step is explicit.",
      "If the task reopens gray-area planning, hand it back to qc-flow instead of improvising execution."
    ].join("\n");
  }

  return [
    ...header,
    "",
    "Stay in strict qc-lock execution mode.",
    `Current step: ${currentStep}`,
    `Current verify: ${currentVerify}`,
    "Execute only the active locked step, verify it before advancing, and update the lock artifact after the step changes state.",
    "If scope expands or the verify path changes, relock before continuing."
  ].join("\n");
}

export function enforceQcLockProtocol({
  dir,
  task,
  executionMode = "manual",
  activeLockArtifact = null,
  activeFlowArtifact = null
}) {
  let artifact = activeLockArtifact ?? null;
  let created = false;
  let handoffArtifact = null;
  if (!artifact) {
    const discoveredLock = readActiveLockArtifact(dir)?.artifact ?? null;
    if (discoveredLock) {
      artifact = discoveredLock;
    }
  }
  if (!artifact) {
    const flowArtifact = activeFlowArtifact
      ?? readActiveRunArtifact(dir)?.artifact
      ?? null;
    if (hasTrustedFlowHandoff(flowArtifact)) {
      handoffArtifact = flowArtifact;
      artifact = createLockArtifactFromFlow({
        dir,
        task,
        executionMode,
        flowArtifact
      });
      created = true;
    } else {
      artifact = createStandaloneLockArtifact({ dir, task, executionMode });
      created = true;
    }
  }
  const gateState = effectiveLockGate(artifact);
  return {
    artifact,
    created,
    effectiveGate: gateState.gate,
    gateReason: gateState.reason,
    handoffArtifactRun: handoffArtifact?.relativeRunPath ?? null,
    prompt: buildQcLockProtocolPrompt({
      artifact,
      task,
      gate: gateState.gate,
      created,
      gateReason: gateState.reason,
      handoffArtifactRun: handoffArtifact?.relativeRunPath ?? null
    })
  };
}
