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

Affected area / blast radius:
- ...

Current gate:
- clarify | research | plan | plan-check | execute | phase-close | done

Execution mode:
- manual | auto

## Resume Digest
- Goal: ...
- Execution mode: ...
- Current gate: ...
- Current phase / wave: P1 / W1
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Next verify: ...
- Recommended next command: ...

## Compact-Safe Summary
- Goal: ...
- Current gate: ...
- Current phase / wave: P1 / W1
- Requirements still satisfied: R1, R2
- Remaining blockers: none
- Experience constraints: none
- Active hook-derived invariants: none
- Phase relation: same-phase | dependent-next-phase | independent-next-phase | relock-before-next-phase
- Compaction action: compact | clear | relock
- Brain session-action verdict: allow-compact | allow-clear | relock-first | block-action | unavailable | not-evaluated
- Brain verdict confidence: high | medium | low | n/a
- Brain verdict rationale: ...
- Brain verdict source: experience-engine-brain | protocol-fallback | not-recorded
- Suggested session action: ...
- Carry-forward invariants: ...
- What to forget: ...
- What must remain loaded: ...
- Next verify: ...
- Resume with: `Use $qc-flow and resume from .quick-codex-flow/<task-slug>.md ...`

## Wave Handoff
- Trigger: completed wave | phase close | feature close | broad verify | escalation | deliberate pause
- Source checkpoint: P1 / W1
- Next target: P1 / W2 | phase-close | review completed feature close | done
- Phase relation: same-phase | dependent-next-phase | independent-next-phase | relock-before-next-phase
- Brain session-action verdict: allow-compact | allow-clear | relock-first | block-action | unavailable | not-evaluated
- Brain verdict confidence: high | medium | low | n/a
- Brain verdict rationale: ...
- Brain verdict source: experience-engine-brain | protocol-fallback | not-recorded
- Suggested session action: ...
- Sealed decisions: ...
- Carry-forward invariants: ...
- Expired context: ...
- What to forget: ...
- What must remain loaded: ...
- Resume payload: `Use $qc-flow and resume from .quick-codex-flow/<task-slug>.md ...`

## Next Wave Pack
- optional: only emit when `Phase relation` is `same-phase` and the next target is already explicit
- Target: P1 / W2
- Derived from: P1 / W1
- Phase relation: same-phase
- Compaction action: compact
- Brain session-action verdict: allow-compact | allow-clear | relock-first | block-action | unavailable | not-evaluated
- Brain verdict confidence: high | medium | low | n/a
- Brain verdict rationale: ...
- Brain verdict source: experience-engine-brain | protocol-fallback | not-recorded
- Suggested session action: ...
- Wave goal: ...
- Done when: ...
- Next verify: ...
- Carry-forward invariants: ...
- What to forget: ...
- What must remain loaded: ...
- Resume payload: `Use $qc-flow and resume from .quick-codex-flow/<task-slug>.md ...`

## Session Risk
- low | medium | high
Why:
- ...

## Context Risk
- low | medium | high
Why:
- ...

## Burn Risk
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

## Experience Snapshot
Active warnings:
- none
Why:
- no relevant Experience Engine warnings have been recorded in this run
Decision impact:
- none
Experience constraints:
- none
Active hook-derived invariants:
- none
Still relevant:
- no hook-derived carry-forward is active
Ignored warnings:
- none

## Clarify State
<paste the current clarify artifact here>

## Evidence Basis
- repo evidence: ...
- docs or external evidence: ...
- explicit research-skip rationale: none

## Research Pack
<paste the current research artifact here>

## Verified Plan
<paste the verified plan here>

## Current Execution Wave
<paste the active execution wave artifact here>

## Latest Phase Close
<paste the most recent phase-close artifact here>

## Latest Feature Close
<paste the most recent feature-close artifact here>

## Current Status
Current phase: P1
Current wave: W1
Execution state: pending | in_progress | blocked | done

## Recommended Next Command
- `Use $qc-flow and resume from .quick-codex-flow/<task-slug>.md ...`
- or `Use $qc-lock for this task: execute P1 / W1 from .quick-codex-flow/<task-slug>.md ...`

## Verification Ledger
- <timestamp> <command or method> -> <result>

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
- reread it before resuming
- read `Resume Digest` before deeper sections
- if a native Codex planner is available, keep a short mirror of the current gate and active phase or wave synced to this file, but do not rely on it for continuity
- keep `.quick-codex-flow/STATE.md` aligned with the current active run
- always update `Current gate` when moving between workflow stages
- keep `Requirement Baseline` stable unless the user changes requirements
- treat `Verified Plan` as the roadmap for one feature or issue; phases and waves should stay aligned to it until feature close
- keep `Affected area / blast radius` current when planning or relocking changes what may be touched
- update `Requirements Still Satisfied` after each completed phase
- keep `Inputs` current when the plan depends on specific source artifacts or docs
- keep `Experience Snapshot` current whenever a hook warning changes scope, verify, or invariant requirements
- when pasting artifacts into a section, do not repeat the section heading inside that section
- keep `Recommended Next Command` concrete enough that the user can paste it directly
- do not mark a planning-only run complete until `Recommended Next Command` is filled in
- do not mark the run `done` until the roadmap is complete and `Latest Feature Close` is recorded
- refresh `Resume Digest` after planning handoff, wave completion, and phase close
- refresh `Compact-Safe Summary` after every completed wave and phase
- refresh `Wave Handoff` after every completed wave and phase
- refresh `Latest Feature Close` when the final roadmap checkpoint is reached
- refresh `Next Wave Pack` when same-phase routing is explicit after a completed wave; remove it when the route is no longer explicit
- refresh `Compact-Safe Summary` before any broad or long-running verify and before stopping for a pause
- refresh `Wave Handoff` before any broad or long-running verify and before stopping for a pause
- treat `same-phase` as `compact`, `dependent-next-phase` as downstream-only `compact`, `independent-next-phase` as `clear`, and `relock-before-next-phase` as `relock`
- keep the protocol-derived `Compaction action` as the single-good baseline even when no brain verdict is available
- if Experience Engine is configured, record the brain verdict fields; if it is unavailable, record the fallback explicitly instead of leaving the field blank
- treat the brain verdict as advisor-in-guardrails: it may confirm or veto the baseline action, but it must not bypass protocol guardrails
- refresh the experience lines in both summaries when active hook-derived constraints change
- keep `Wave Handoff` shorter than surrounding execution prose; it exists to survive deliberate compaction
- keep `Next Wave Pack` narrower than the full execution-wave narrative; it exists to make the next same-phase route cheap to resume
- treat stale `Wave Handoff` fields as a resumability bug, not as cosmetic drift
- if `Session Risk` or `Context Risk` is `high`, checkpoint before opening new scope
- refresh `Stall Status` after any stalled or long-running verify step
- refresh `Burn Risk` after thrash, stall, or repeated unchanged-state turns
- keep `Approval Strategy` current whenever escalation becomes possible or necessary
- after each clean coding wave or phase, record the checkpoint commit if one was created before continuing
