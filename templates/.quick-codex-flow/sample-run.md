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
- Experience constraints: checkpoint hook-derived constraints before a broad verify or likely pause
- Active hook-derived invariants: a relevant warning stays active until the run records that it is no longer relevant
- Next verify: confirm the verified plan
- Recommended next command: `Use $qc-flow and resume from .quick-codex-flow/sample-run.md.`
## Compact-Safe Summary
- Goal: demonstrate the run-file structure
- Current gate: plan-check
- Current phase / wave: P1 / W1
- Requirements still satisfied: R1, R2, R3, R4
- Remaining blockers: none
- Experience constraints: checkpoint hook-derived constraints before a broad verify or likely pause
- Active hook-derived invariants: a relevant warning stays active until the run records that it is no longer relevant
- Phase relation: same-phase
- Compaction action: compact
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: Experience Engine verdict is not recorded yet; fall back to the protocol baseline.
- Brain verdict source: not-recorded
- Suggested session action: `/compact` after reviewing this summary and resume payload.
- Carry-forward invariants: keep the hook-derived guardrail and the verified-plan checkpoint active during resume; preserve the active hook-derived guardrail and the verified-plan checkpoint; a relevant warning stays active until the run records that it is no longer relevant
- What to forget: broad narration that does not change the next command
- What must remain loaded: current phase/wave, next verify, recommended next command, and active experience constraint
- Next verify: confirm the verified plan
- Resume with: `Use $qc-flow and resume from .quick-codex-flow/sample-run.md.`
## Wave Handoff
- Trigger: planning handoff
- Source checkpoint: P1 / W1
- Next target: execute P1 / W1
- Phase relation: same-phase
- Brain session-action verdict: not-evaluated
- Brain verdict confidence: n/a
- Brain verdict rationale: Experience Engine verdict is not recorded yet; fall back to the protocol baseline.
- Brain verdict source: not-recorded
- Suggested session action: `/compact` after reviewing this summary and resume payload.
- Sealed decisions: the sample uses the run artifact as the source of truth for resume
- Carry-forward invariants: keep the hook-derived guardrail and the verified-plan checkpoint active during resume; preserve the active hook-derived guardrail and the verified-plan checkpoint; a relevant warning stays active until the run records that it is no longer relevant
- Expired context: exploratory chat recap that is already captured by the artifact
- What to forget: broad narration that does not change the next command
- What must remain loaded: current phase/wave, next verify, recommended next command, and active experience constraint
- Resume payload: `Use $qc-flow and resume from .quick-codex-flow/sample-run.md.`
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

## Experience Snapshot
Active warnings:
- `[id:demo1 col:experience-demo]` Persist hook-derived guardrails before a pause or compaction-sensitive verify.
Why:
- the next session should recover the warning impact from the artifact instead of relying on chat memory
Decision impact:
- keep resume-safe experience constraints in the run file and carry them into the handoff summaries
Experience constraints:
- checkpoint hook-derived constraints before a broad verify or likely pause
Active hook-derived invariants:
- a relevant warning stays active until the run records that it is no longer relevant
Still relevant:
- yes, this sample demonstrates experience-preserving resume
Ignored warnings:
- none
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
Feature / issue this roadmap closes: sample-medium-task
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

## Latest Feature Close
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
