---
name: "qc-flow"
description: "Use when the user has a non-trivial coding task and Codex should first clarify the problem, check whether context is sufficient, research only the missing pieces, create and verify a plan, decompose the work into phases and waves, then execute sequentially with persistent artifacts. This is a Codex-native planning workflow for Quick Codex: strong front-half thinking, explicit artifacts, and deterministic single-agent execution. Friendly with Experience Engine hooks and designed for small context windows."
---

# Quick Codex Flow

Use this skill for non-trivial implementation work where Codex should not jump straight into coding.

This skill keeps a disciplined front-half workflow:
- discuss until the problem is clear
- do not plan with missing context
- research intentionally, not blindly
- verify the plan before execution
- decompose the work before touching code

This skill changes the execution model for Codex:
- no dependence on multi-agent execution
- sequential phase and wave execution
- persistent artifacts as the source of truth

## Core principle

Think first, then lock context, then plan, then execute.

The workflow must work without any external system.
When Experience Engine hooks are available, treat them as risk signals that strengthen the current artifact or verification path.

## When to use

Use this skill for:
- features or fixes spanning multiple files
- tasks with unclear requirements or missing repo context
- work that needs research before implementation
- tasks where Codex tends to drift if it codes too early
- work likely to outlive a single turn

Do not use this skill for:
- trivial one-file edits
- pure brainstorming with no execution target
- requests where the user explicitly wants immediate coding without gating

## Fast-path mode

Use a fast path when the task is already narrow and the front-half is mostly complete on first inspection.

Fast-path conditions:
- clarify is effectively already satisfied
- context sufficiency is already satisfied
- the remaining work fits one small phase or one tightly scoped wave
- the verify path is already obvious

Fast-path rules:
- keep the baseline and run file, but compress the planning prose
- do not force extended research when no material gap exists
- move quickly from plan-check to a single active wave when safe
- recommend `$qc-lock` early when the remaining work is pure execution

Do not use fast path when:
- requirements are still moving
- repo area is still uncertain
- verification is still ambiguous
- a relock is likely

## Required workflow

Follow this sequence:

1. Clarify
2. Context sufficiency check
3. Research loop if needed
4. Plan
5. Plan check
6. Phase and wave decomposition
7. Sequential execution handoff

Do not skip a gate because the likely solution feels obvious.

## Persistent artifacts

For non-trivial work, maintain a run file:
- `.quick-codex-flow/<task-slug>.md`

This run file is the source of truth across turns.

The run file must preserve:
- original goal
- planning inputs or source artifacts
- required outcomes
- constraints
- resume digest
- session risk
- context risk
- stall status
- approval strategy
- current workflow gate
- open questions and resolved decisions
- context sufficiency status
- current research artifact
- verified plan
- phase and wave table
- current execution wave artifact
- latest phase-close artifact
- current execution status
- recommended next command
- verification ledger

Before resuming work, read the run file first.

## Resume Digest

Every non-trivial run must maintain a compact `Resume Digest` inside the run file.

The digest should be short enough to survive aggressive compaction and fast enough to reread before any deeper artifact sections.

The digest must capture:
- goal
- current gate
- current phase and wave
- remaining blockers
- next verify
- recommended next command

Update the digest:
- after planning-only handoff
- after every completed wave
- at every phase close
- before stopping when session or context risk is high

## Session and context risk

Every non-trivial run must track:
- `Session Risk`
- `Context Risk`

Use `low`, `medium`, or `high`.

`Session Risk` means the current run may be too large, too long, or too interruption-prone for the current session.

`Context Risk` means the current state may be lost or misread if Codex continues without a fresh checkpoint or relock.

Risk rules:
- if either risk is `high`, do not open a new phase
- if either risk is `high`, checkpoint the run file before more work
- if both are `high`, prefer phase-close, relock, or stop with a concrete `Recommended next command`
- keep the risk reason short and actionable

## Gate 1: Clarify

Do not plan until the problem is clear enough.

Create a short clarification artifact using [references/context-gate-template.md](references/context-gate-template.md).

Clarify until you can state:
- what the user wants
- what success looks like
- what is constrained
- what remains unknown

If critical ambiguity remains, stay in clarify mode.

## Gate 2: Context sufficiency check

Before research or planning, check whether current context is sufficient.

Context is sufficient only if you know:
- the likely repo area or module
- the relevant files or search targets
- the main technical constraints
- the main risks or unknowns
- how success will be verified

If any of these are weak, record the gap and continue to research.

## Gate 3: Research loop

Research only the missing context.

Create or update a targeted research artifact using [references/research-pack-template.md](references/research-pack-template.md).

Research rules:
- keep research targeted
- capture evidence, answered questions, unresolved questions, and a stop decision in the research artifact
- summarize only the research conclusion into the run file if needed
- prefer concrete repo evidence over speculation
- stop researching once the missing gate items are satisfied

If research reveals new ambiguity, return to clarify before planning.

When Experience Engine warnings are relevant during research:
- record them in the research artifact as evidence or risk input
- map the `Why:` line into the current research rationale or downstream verification path

## Gate 4: Plan

Once context is sufficient, create a short plan for the whole task.

The plan must:
- map back to required outcomes
- include a verification path
- separate discovery from implementation where useful
- avoid hidden scope expansion

Use [references/verified-plan-template.md](references/verified-plan-template.md).

For planning-only runs, the plan must also make the implementation handoff obvious:
- what inputs the plan used
- what the verified plan now enables
- which command should be used next to continue

Planning-only completion rule:
- do not treat a planning-only run as complete until it includes a concrete `Recommended next command`
- if the plan is verified but no next command is provided, the run is still incomplete

## Gate 5: Plan check

Check the plan before execution.

A plan passes only if:
- every phase traces to at least one required outcome
- dependencies are clear
- verification exists for every phase
- risky assumptions are called out
- out-of-scope items are explicit

If the plan fails, revise it before execution.

## Gate 6: Phase and wave decomposition

Decompose the verified plan into phases and waves.

Definitions:
- `phase` = a meaningful milestone with a user-visible or architecture-visible outcome
- `wave` = a small execution batch inside a phase

For Codex, waves are primarily dependency markers, not parallel-agent work.

Rules:
- phases should be independently understandable
- each phase must list covered requirements
- each wave should be small enough for one focused implementation pass
- only one wave is active at a time

## Gate 7: Sequential execution handoff

After plan verification, switch to sequential execution.

Create an active wave artifact using [references/execution-wave-template.md](references/execution-wave-template.md).

Execution rules:
- execute one wave at a time
- verify the wave before the next one
- if verification fails, fix inside the same wave
- after each wave, update the run file
- keep the active wave artifact current while a wave is in progress
- after each phase, create or update a phase-close artifact using [references/phase-close-template.md](references/phase-close-template.md)
- keep the current approval strategy explicit when escalation may be needed

If implementation reveals a missing task that changes scope or dependencies, stop and return to plan check.

## Anti-thrash rules

Do not keep applying speculative fixes in the same wave without new evidence.

Use this rule set:
- after the first failed verify, state one concrete hypothesis and test only that
- after the second failed verify, either produce new evidence or relock
- after the third failed verify in the same wave, stop execution, mark the wave blocked, and return to `plan-check` or `phase-close`

Thrash indicators:
- the same command fails repeatedly without a changed hypothesis
- fixes are broadening scope without updating the plan
- verification is being deferred instead of rerun

## Anti-stall protocol

Treat a `stall` as different from a failed verify.

A stall means:
- a tool or verify step takes unusually long without a useful signal
- Codex is waiting on ambiguous progress instead of a concrete result
- the next check is still too broad to diagnose the current step safely

Stall rules:
- after the first stall, checkpoint the run file and narrow the next check
- after the second stall in the same wave, split the verify path into a smaller observable check or relock
- after the third stall in the same wave, stop execution, mark the wave blocked, and emit a concrete `Recommended next command`

When a stall happens, record:
- `Stall Status`
- the last stalled step
- the next smaller check

Prefer bounded, observable checks over long opaque waits.

## Approval-aware execution

When execution may require approval or escalation, prefer a local-first strategy.

Approval rules:
- do local reads, static inspection, and narrow verification before asking for escalation
- batch related safe checks before any escalated step
- if escalation is needed, tie it to the current phase or wave explicitly
- prefer the narrowest command that can achieve the current verify goal
- if approval is denied or unavailable, checkpoint the run file and emit a concrete `Recommended next command`

Track the current `Approval Strategy` in the run file when escalation is relevant:
- `local-only`
- `local-first-then-escalate`
- `escalation-required`

Why this matters:
- it reduces approval thrash
- it keeps verification auditable
- it makes blocked execution resumable instead of vague

## Resume protocol

When resuming:

1. Read the run file.
2. Read the `Resume Digest` first.
3. Check `Session Risk` and `Context Risk`.
4. Restate:
   - current gate
   - original goal
   - required outcomes
   - current phase
   - current wave
   - remaining blockers
   - stall status
   - approval strategy
   - next verify
5. Continue only after restating this state.

If either risk is `high`, address that before opening new scope.

If chat context and run file disagree, trust the run file unless the user changed the requirement.

Gate meanings:
- `clarify` — requirements or success conditions are still ambiguous
- `research` — missing context is being filled
- `plan` — the task is being decomposed
- `plan-check` — the plan is being verified before execution
- `execute` — a wave is actively being implemented or verified
- `phase-close` — a phase is being checked and summarized before the next phase
- `done` — all required outcomes are complete and verified

Completion rule:
- a run is not `done` if the current state requires an obvious next step but the response or run file omits `Recommended next command`
- a planning-only run may finish with execution deferred, but it must still include the exact next recommended command
- a run is not safely resumable if `Resume Digest` or the current risk fields are stale after a meaningful checkpoint
- a run is not safely resumable if `Stall Status` or `Approval Strategy` is stale after a blocked or escalated step

## Experience Engine integration

This skill must not depend on `experience-engine`, but it should work well with it.

When hooks surface a relevant warning:
- fold the warning into the current clarify, research, plan, or execution artifact
- route the warning into the right artifact section:
  - `Clarify State` -> scope, constraints, or open questions
  - `Research Pack` -> evidence, answered questions, or unresolved risks
  - `Execution Wave` -> `Risks`, `Invariant requirements`, or `Verify`
  - `Phase Close` -> carry-forward notes or remaining open risks
- use the `Why:` line as:
  - `Risks`
  - `Invariant requirements`
  - `Verify`
- do not silently ignore repeated noisy warnings

If you deliberately ignore a repeated noisy suggestion, report it with:

```bash
curl -s -X POST http://localhost:8082/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"pointId":"xxxx","collection":"col-name","followed":false}'
```

Replace `xxxx` and `col-name` from the hook suffix:

```text
[id:xxxx col:name]
```

## Output contract

Use this response shape:

1. `Current gate` status
2. `Overall picture` once the task is clear enough:
   - goal
   - planning inputs or source artifacts
   - required outcomes
   - out of scope
3. `Research artifact` status when Gate 3 is active
4. `Verified Plan` summary once planning is complete:
   - what the plan is for
   - what outcome the plan now enables
5. `Phase / Wave` table when execution is ready
6. `Current execution wave` artifact during implementation
7. `Phase close` status when a phase is finishing
8. `Verification result` after each wave or phase
9. `Recommended next command` when:
   - a planning-only run ends
   - execution is deferred
   - a phase closes and the next step is clear

`Recommended next command` rules:
- recommend the exact next skill to use
- prefer `$qc-flow` when staying in the same run file or changing gates
- recommend `$qc-lock` only when the verified plan is already clear and the handoff target is one tightly scoped wave
- include a concrete command or prompt line the user can paste
- if both options are viable, recommend one first and mention the alternative briefly
- treat this field as required, not optional, whenever the next step is already knowable from the current run state

Keep responses concise. The artifacts carry the long-term state.

## Artifact formatting rules

When updating the run file:
- paste artifact content into the matching section without duplicating the section heading
- do not produce `## Clarify State` inside the `## Clarify State` section
- do not produce `## Research Pack` inside the `## Research Pack` section
- do not produce `## Verified Plan` inside the `## Verified Plan` section
- keep the run file readable as a single document, not as nested markdown fragments

## References

Read these only when needed:
- [references/context-gate-template.md](references/context-gate-template.md)
- [references/research-pack-template.md](references/research-pack-template.md)
- [references/verified-plan-template.md](references/verified-plan-template.md)
- [references/execution-wave-template.md](references/execution-wave-template.md)
- [references/phase-close-template.md](references/phase-close-template.md)
- [references/run-file-template.md](references/run-file-template.md)
