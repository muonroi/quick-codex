import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { enforceQcFlowProtocol, enforceQcLockProtocol } from "../lib/wrapper/protocol.js";

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-protocol-"));
  fs.mkdirSync(path.join(dir, ".quick-codex-flow"), { recursive: true });
  return dir;
}

function writeRun(dir, name, body) {
  const flowDir = path.join(dir, ".quick-codex-flow");
  fs.mkdirSync(flowDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, name), body, "utf8");
  return `.quick-codex-flow/${name}`;
}

function writeState(dir, activeRun, gate = "clarify", phaseWave = "P1 / W0", executionMode = "auto") {
  fs.writeFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), `# Quick Codex Flow State

Active run:
- ${activeRun}

Active lock:
- none

Current gate:
- ${gate}

Current phase / wave:
- ${phaseWave}

Execution mode:
- ${executionMode}

Status:
- active
`, "utf8");
}

test("enforceQcFlowProtocol bootstraps a task-specific clarify artifact for a fresh passthrough qc-flow task", () => {
  const dir = makeDir();
  const result = enforceQcFlowProtocol({
    dir,
    task: "Explore Storyflow anti-bot behavior and plan the hardening work",
    executionMode: "auto"
  });

  assert.equal(result.created, true);
  assert.equal(result.effectiveGate, "clarify");
  assert.match(result.artifact.relativeRunPath, /^\.quick-codex-flow\/explore-storyflow-anti-bot-behavior-and-plan-the-hardening-work(?:-\d+)?\.md$/);
  assert.match(result.artifact.delegationState.mainAgentRule, /Do not advance past the active delegated checkpoint/i);
  assert.match(result.prompt, /Do not implement code, do not edit product files/);
  assert.match(result.prompt, /present at least 3 options for each gray area/);
  assert.match(result.prompt, /Current enforced gate: clarify/);

  const state = fs.readFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), "utf8");
  assert.match(state, /Current gate:\n- clarify/);
  assert.match(state, /Execution mode:\n- auto/);
});

test("enforceQcFlowProtocol keeps front-half runs in research without allowing execution", () => {
  const dir = makeDir();
  const runName = writeRun(dir, "storyflow-review.md", `# Run: storyflow-review

## Requirement Baseline
Original goal:
- Review Storyflow anti-bot behavior

## Resume Digest
- Goal: Review Storyflow anti-bot behavior
- Execution mode: auto
- Current gate: research
- Current phase / wave: P1 / W0
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`rg StoryFlow\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Research Pack
Pending targeted research.

## Verified Plan
Pending verified plan.

## Current Status
Current phase: P1
Current wave: W0
Execution state: pending

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Blockers
- none
`);
  writeState(dir, runName, "research");

  const result = enforceQcFlowProtocol({
    dir,
    task: "Take finding 1 first and implement the change",
    executionMode: "auto"
  });

  assert.equal(result.created, false);
  assert.equal(result.effectiveGate, "research");
  assert.match(result.prompt, /Follow qc-flow strictly at the current front-half gate/);
  assert.match(result.prompt, /Do not implement code/);
});

test("enforceQcFlowProtocol blocks execute until a verified plan exists", () => {
  const dir = makeDir();
  const runName = writeRun(dir, "storyflow-review.md", `# Run: storyflow-review

## Requirement Baseline
Original goal:
- Review Storyflow anti-bot behavior

## Resume Digest
- Goal: Review Storyflow anti-bot behavior
- Execution mode: auto
- Current gate: execute
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`dotnet test\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Research Pack
Reviewed the relevant Storyflow anti-crawler files.

## Delivery Roadmap
Roadmap goal:
- close the Storyflow anti-bot review safely

Roadmap status:
- in-progress

Current roadmap phase:
- P1

| Phase | Status | Purpose | Depends on | Verification checkpoint |
|---|---|---|---|---|
| P1 | in-progress | validate the first implementation milestone | none | targeted Storyflow tests |

## Verified Plan
Pending verified plan.

## Current Execution Wave
No execution wave is active until plan-check passes.

## Current Status
Current phase: P1
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Blockers
- none
`);
  writeState(dir, runName, "execute", "P1 / W1");

  const result = enforceQcFlowProtocol({
    dir,
    task: "Implement finding 1 now",
    executionMode: "auto"
  });

  assert.equal(result.effectiveGate, "plan-check");
  assert.match(result.prompt, /Execution is allowed only after the plan is explicitly verified/);
  assert.match(result.prompt, /Current enforced gate: plan-check/);
});

test("enforceQcFlowProtocol blocks planning and execution until a delivery roadmap exists", () => {
  const dir = makeDir();
  const runName = writeRun(dir, "storyflow-review.md", `# Run: storyflow-review

## Requirement Baseline
Original goal:
- Review Storyflow anti-bot behavior

## Resume Digest
- Goal: Review Storyflow anti-bot behavior
- Execution mode: auto
- Current gate: execute
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`dotnet test\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Verified Plan
Phase table:
- P1 / W1: implement trusted telemetry partitioning

## Delegation State
- Research delegation: completed
- Plan-check delegation: completed
- Goal-audit delegation: idle
- Active delegated checkpoint: none
- Waiting on: none
- Main-agent rule: Do not advance past the active delegated checkpoint until the matching result is merged into this run artifact.

## Plan-Check Delegation
Assignment:
- Audit the active Verified Plan and prove that execution may start safely.

Delegate status:
- completed

Worker prompt:
- Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md. Work only as a blocking plan-check worker.

Expected artifact update:
- Verified Plan + Workflow State + Resume Digest

Result summary:
- plan-check completed

Result verdict:
- pass

Recommended transition:
- plan-check -> execute

## Current Execution Wave
Execute the trusted telemetry partitioning change and verify tests.

## Current Status
Current phase: P1
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Blockers
- none
`);
  writeState(dir, runName, "execute", "P1 / W1");

  const result = enforceQcFlowProtocol({
    dir,
    task: "Implement finding 1 now",
    executionMode: "auto"
  });

  assert.equal(result.effectiveGate, "roadmap");
  assert.match(result.prompt, /Stay in qc-flow roadmap mode/);
  assert.match(result.prompt, /Current enforced gate: roadmap/);
});

test("enforceQcFlowProtocol allows execute only after the run contains a verified plan", () => {
  const dir = makeDir();
  const runName = writeRun(dir, "storyflow-review.md", `# Run: storyflow-review

## Requirement Baseline
Original goal:
- Review Storyflow anti-bot behavior

## Resume Digest
- Goal: Review Storyflow anti-bot behavior
- Execution mode: auto
- Current gate: execute
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`dotnet test\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Research Pack
Reviewed the relevant Storyflow anti-crawler files.

## Delivery Roadmap
Roadmap goal:
- close the Storyflow anti-bot review safely

Roadmap status:
- in-progress

Current roadmap phase:
- P1

| Phase | Status | Purpose | Depends on | Verification checkpoint |
|---|---|---|---|---|
| P1 | in-progress | validate the first implementation milestone | none | targeted Storyflow tests |

## Verified Plan
Phase table:
- P1 / W1: implement trusted telemetry partitioning

## Current Execution Wave
Execute the trusted telemetry partitioning change and verify tests.

## Current Status
Current phase: P1
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/storyflow-review.md\`

## Blockers
- none
`);
  writeState(dir, runName, "execute", "P1 / W1");

  const result = enforceQcFlowProtocol({
    dir,
    task: "Implement finding 1 now",
    executionMode: "auto"
  });

  assert.equal(result.effectiveGate, "execute");
  assert.match(result.prompt, /Execution is now allowed because the run already passed the front-half gates/);
});

test("enforceQcLockProtocol bootstraps standalone qc-lock work into preflight before locking", () => {
  const dir = makeDir();
  const result = enforceQcLockProtocol({
    dir,
    task: "Implement the focused Storyflow telemetry fix",
    executionMode: "auto"
  });

  assert.equal(result.created, true);
  assert.equal(result.effectiveGate, "preflight");
  assert.match(result.artifact.relativeRunPath, /^\.quick-codex-lock\/implement-the-focused-storyflow-telemetry-fix(?:-\d+)?\.md$/);
  assert.match(result.prompt, /Do a short qc-lock preflight before writing product changes/);
  assert.match(result.prompt, /Current enforced gate: preflight/);

  const state = fs.readFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), "utf8");
  assert.match(state, /Active lock:\n- \.quick-codex-lock\//);
  assert.match(state, /Current gate:\n- preflight/);
});

test("enforceQcLockProtocol creates a trusted handoff lock when qc-flow is already execute-ready", () => {
  const dir = makeDir();
  const runName = writeRun(dir, "storyflow-plan.md", `# Run: storyflow-plan

## Requirement Baseline
Original goal:
- Implement Storyflow telemetry hardening

## Resume Digest
- Goal: Implement Storyflow telemetry hardening
- Execution mode: auto
- Current gate: execute
- Current phase / wave: P2 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: \`dotnet test Storyflow.Host.Tests\`
- Recommended next command: \`Use $qc-flow and resume from .quick-codex-flow/storyflow-plan.md\`

## Clarify State
Goal:
- Implement Storyflow telemetry hardening

Affected area / blast radius:
- src/Host telemetry partitioning and its targeted tests

## Research Pack
Confirmed the Storyflow telemetry partitioning paths and the targeted tests.

## Delivery Roadmap
Roadmap goal:
- implement Storyflow telemetry hardening safely

Roadmap status:
- in-progress

Current roadmap phase:
- P2

| Phase | Status | Purpose | Depends on | Verification checkpoint |
|---|---|---|---|---|
| P1 | done | validate the upstream telemetry review | none | targeted read-through |
| P2 | in-progress | implement the telemetry hardening milestone | P1 | Storyflow.Host.Tests targeted run |

## Verified Plan
Phase table:
- P2 / W1: implement the telemetry hardening change and verify targeted tests

## Delegation State
- Research delegation: completed
- Plan-check delegation: completed
- Goal-audit delegation: idle
- Active delegated checkpoint: none
- Waiting on: none
- Main-agent rule: Do not advance past the active delegated checkpoint until the matching result is merged into this run artifact.

## Plan-Check Delegation
Assignment:
- Audit the active Verified Plan and prove that execution may start safely.

Delegate status:
- completed

Worker prompt:
- Use $qc-flow and resume from .quick-codex-flow/storyflow-plan.md. Work only as a blocking plan-check worker.

Expected artifact update:
- Verified Plan + Workflow State + Resume Digest

Result summary:
- plan-check completed

Result verdict:
- pass

Recommended transition:
- plan-check -> execute

## Current Execution Wave
Execute the trusted telemetry hardening change and verify targeted tests.

## Current Status
Current phase: P2
Current wave: W1
Execution state: in_progress

## Recommended Next Command
- \`Use $qc-flow and resume from .quick-codex-flow/storyflow-plan.md\`

## Blockers
- none
`);
  writeState(dir, runName, "execute", "P2 / W1");

  const result = enforceQcLockProtocol({
    dir,
    task: "Take finding 1 first and implement it",
    executionMode: "auto"
  });

  assert.equal(result.created, true);
  assert.equal(result.effectiveGate, "execute");
  assert.equal(result.handoffArtifactRun, ".quick-codex-flow/storyflow-plan.md");
  assert.match(result.artifact.relativeRunPath, /^\.quick-codex-lock\/take-finding-1-first-and-implement-it(?:-\d+)?\.md$/);
  assert.match(result.prompt, /Stay in strict qc-lock execution mode/);
  assert.match(result.prompt, /Trusted upstream handoff: \.quick-codex-flow\/storyflow-plan\.md/);
  assert.match(result.prompt, /Current enforced gate: execute/);

  const state = fs.readFileSync(path.join(dir, ".quick-codex-flow", "STATE.md"), "utf8");
  assert.match(state, /Active run:\n- \.quick-codex-flow\/storyflow-plan\.md/);
  assert.match(state, /Active lock:\n- \.quick-codex-lock\//);
  assert.match(state, /Current gate:\n- execute/);
});
