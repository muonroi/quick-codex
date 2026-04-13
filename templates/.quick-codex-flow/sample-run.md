# Run: sample-medium-task

## Requirement Baseline
Original goal:
- Demonstrate the shape of a `qc-flow` run artifact.

Inputs:
- user request
- local repository context

Required outcomes:
- R1: clarify the task
- R2: verify the plan
- R3: recommend the next command

Constraints:
- keep the task small and auditable

Out of scope:
- implementation details for a real task

Definition of done:
- this sample demonstrates the core run-file sections

Current gate:
- plan-check

Companion project state:
- `.quick-codex-flow/STATE.md` points to this run while it is the active run

## Resume Digest
- Goal: demonstrate the run-file structure
- Execution mode: manual
- Current gate: plan-check
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Next verify: confirm the verified plan
- Recommended next command: `Use $qc-lock in manual mode for this task: execute P1 / W1 from .quick-codex-flow/sample-run.md with step-local verification first.`

## Execution Mode
- manual
Why:
- this sample demonstrates checkpoint-first flow control

## Budget Mode
- balanced
Why:
- this sample shows the default profile without quota pressure

## Budget Rules
- Prefer digest-first updates when only status changed.
- Keep artifact sections short unless new ambiguity appears.
- Hand off to `$qc-lock` early when the remaining work is mostly execution.

## Burn Risk
- low
Why:
- the sample stays on a single narrow planning step
Last Budget Trigger:
- none

## Session Risk
- low
Why:
- this is a static sample

## Context Risk
- low
Why:
- no active implementation state exists

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

## Research Pack
Decision:
- `context-sufficient`

## Verified Plan
Goal: demonstrate one phase and one wave.

## Current Execution Wave
Not started.

## Latest Phase Close
Not started.

## Current Status
Current phase: P1
Current wave: W1
Execution state: pending

## Resume Routing Example
- `manual`: reread this run, confirm `plan-check`, then stop with the concrete `$qc-lock` handoff below
- `auto`: only continue automatically if this run is switched to `Execution mode: auto` and the same handoff is still the next safe move

## Recommended Next Command
- `Use $qc-lock in manual mode for this task: execute P1 / W1 from .quick-codex-flow/sample-run.md with step-local verification first.`
- or `Use $qc-lock in auto mode for this task: execute P1 / W1 from .quick-codex-flow/sample-run.md and continue step by step until the locked wave is done or blocked.`

## Verification Ledger
- Result: pass
- Command or method: sample scaffold review
- Small evidence: required sections and next-command examples are present
- Next action: hand off to `$qc-lock` in `manual` or `auto` mode depending on user intent
