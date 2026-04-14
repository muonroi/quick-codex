# Run: sample-medium-task

## Requirement Baseline
Original goal:
- Demonstrate the shape of a `qc-flow` run artifact.

Inputs:
- user request
- local repository context

Required outcomes:
- R1: clarify the task
- R2: surface the affected area
- R3: verify the evidence basis for the plan
- R4: recommend the next command

Constraints:
- keep the task small and auditable

Out of scope:
- implementation details for a real task

Definition of done:
- this sample demonstrates the core run-file sections

Affected area / blast radius:
- run artifact structure
- resume metadata
- planning and handoff sections

Current gate:
- plan-check

Execution mode:
- manual

## Resume Digest
- Goal: demonstrate the run-file structure
- Execution mode: manual
- Current gate: plan-check
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Next verify: confirm the verified plan
- Recommended next command: `Use $qc-flow and resume from .quick-codex-flow/sample-run.md.`

## Compact-Safe Summary
- Goal: demonstrate the run-file structure
- Current gate: plan-check
- Current phase / wave: P1 / W1
- Requirements still satisfied: R1, R2, R3, R4
- Remaining blockers: none
- Next verify: confirm the verified plan
- Resume with: `Use $qc-flow and resume from .quick-codex-flow/sample-run.md.`

## Session Risk
- low
Why:
- this is a static sample

## Context Risk
- low
Why:
- no active implementation state exists

## Burn Risk
- low
Why:
- this sample does not repeat unchanged state

## Stall Status
- none
Last stalled step:
- none
Next smaller check:
- none

## Approval Strategy
- local-only
Current reason:
- this sample does not require escalation
If blocked:
- emit the next command clearly

## Clarify State
Goal:
- show the artifact structure

Affected area / blast radius:
- artifact headings
- resume metadata

## Evidence Basis
- repo evidence: run-file template and CLI parser
- docs or external evidence: none
- explicit research-skip rationale: sample scaffold only

## Research Pack
Decision:
- `context-sufficient`
Why:
- this sample depends only on the package templates and CLI fields

## Verified Plan
Goal: demonstrate one phase and one wave.
Plan inputs / evidence:
- run-file template
- CLI `status`, `resume`, and `doctor-run` fields

Affected area coverage:
- run artifact headings
- resume metadata

## Current Execution Wave
Not started.

## Latest Phase Close
Not started.

## Current Status
Current phase: P1
Current wave: W1
Execution state: pending

## Recommended Next Command
- `Use $qc-flow and resume from .quick-codex-flow/sample-run.md.`

## Verification Ledger
- sample scaffold created

## Blockers
- none

## Requirements Still Satisfied
- R1
- R2
- R3
- R4
