# Run File Template

Recommended path:

```text
.quick-codex-flow/<task-slug>.md
```

Naming:
- task slug: lowercase words separated by `-`
- phase ids: `P1`, `P2`, `P3`
- wave ids: `W1`, `W2`, `W3`
- relock versions: `v1`, `v2`, `v3`

Companion project state:

```markdown
# Active Run State
- Active run: .quick-codex-flow/<task-slug>.md
- Current gate: ...
- Current phase / wave: P1 / W1
- Execution mode: manual | auto
- Status: active | paused | blocked | done
```

Template:

```markdown
# Run: <task name>

## Requirement Baseline
Original goal:
- ...

Inputs:
- ...

Required outcomes:
- R1: ...
- R2: ...

Constraints:
- ...

Out of scope:
- ...

Definition of done:
- ...

Current gate:
- clarify | research | plan | plan-check | execute | phase-close | done

## Resume Digest
- Goal: ...
- Execution mode: manual | auto
- Current gate: ...
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Next verify: ...
- Recommended next command: ...

## Execution Mode
- manual | auto
Why:
- ...

## Budget Mode
- lean | balanced | deep
Why:
- ...

## Budget Rules
- Prefer digest-first updates when only status changed.
- Keep research and planning only as detailed as needed to choose the next safe step.
- Hand off to `$qc-lock` early when the remaining work is mostly execution.

## Burn Risk
- low | medium | high
Why:
- ...
Last Budget Trigger:
- none | unchanged-state turns | wide verify loop | restatement bloat | failure loop | stalled broad check

## Session Risk
- low | medium | high
Why:
- ...

## Context Risk
- low | medium | high
Why:
- ...

## Stall Status
- none | watch | stalled | blocked
Last stalled step:
- ...
Next smaller check:
- ...

## Approval Strategy
- local-only | local-first-then-escalate | escalation-required
Current reason:
- ...
If blocked:
- ...

## Clarify State
<paste the current clarify artifact here>

## Research Pack
<paste the current research artifact here>

## Verified Plan
<paste the verified plan here>

## Current Execution Wave
<paste the active execution wave artifact here>

## Latest Phase Close
<paste the most recent phase-close artifact here>

## Current Status
Current phase: P1
Current wave: W1
Execution state: pending | in_progress | blocked | done

## Recommended Next Command
- `Use $qc-flow and resume from .quick-codex-flow/<task-slug>.md ...`
- or `Use $qc-lock in manual mode for this task: execute P1 / W1 from .quick-codex-flow/<task-slug>.md ...`
- or `Use $qc-lock in auto mode for this task: execute P1 / W1 from .quick-codex-flow/<task-slug>.md ...`

## Verification Ledger
- <timestamp> <command or method> -> <result>
- when verify output is large, record:
  - Result: ...
  - Command or method: ...
  - Small evidence: ...
  - Next action: ...

## Blockers
- none

## Requirements Still Satisfied
- R1
- R2

## Relock History
- v1: initial clarify and plan
- v2: revised after new dependency discovery
```

Rules:
- this file is the source of truth across turns
- keep `.quick-codex-flow/STATE.md` aligned with the current active run when project-level resume is in use
- keep only one active run in `STATE.md` unless the user intentionally manages multiple tracks
- when the current run becomes `done`, clear or replace `Active run` instead of leaving stale state behind
- do not use timestamps alone to choose an active run unless every other signal is already unambiguous
- reread it before resuming
- read `Resume Digest` before deeper sections
- keep `Execution Mode` stable unless the user explicitly changes it
- keep `Budget Mode` stable unless the user or task risk clearly changes
- keep `Budget Rules` short; they are guardrails, not a second plan
- always update `Current gate` when moving between workflow stages
- keep `Requirement Baseline` stable unless the user changes requirements
- update `Requirements Still Satisfied` after each completed phase
- keep `Inputs` current when the plan depends on specific source artifacts or docs
- when pasting artifacts into a section, do not repeat the section heading inside that section
- keep `Recommended Next Command` concrete enough that the user can paste it directly
- do not mark a planning-only run complete until `Recommended Next Command` is filled in
- refresh `Resume Digest` after planning handoff, wave completion, and phase close
- in `lean` mode, prefer digest-only or status-only updates when deeper sections have not materially changed
- when verify output is large, keep only bounded evidence in the run file: result, command or method, small evidence, and next action
- keep `Burn Risk` tied to observed workflow behavior, never inferred token counts
- update `Last Budget Trigger` only when a concrete guardrail condition fired
- if `Burn Risk` is `high`, checkpoint or narrow scope before opening a new wave
- if `Session Risk` or `Context Risk` is `high`, checkpoint before opening new scope
- refresh `Stall Status` after any stalled or long-running verify step
- keep `Approval Strategy` current whenever escalation becomes possible or necessary
