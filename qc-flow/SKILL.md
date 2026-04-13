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

## Lean Budget Mode

Lean Budget Mode is a behavior profile for quota-sensitive Codex sessions.

It exists to reduce workflow overhead without giving up resumability.

Profiles:
- `lean`:
  - use when the user mentions quota burn, rate limits, context pressure, or wants the cheapest viable workflow
  - prefer fast-path behavior
  - keep research conclusion-only unless ambiguity is still blocking
  - keep planning to the minimum needed to choose the next safe step
  - recommend `$qc-lock` as soon as plan-check passes and the remaining work is mostly execution
- `balanced`:
  - default behavior when no strong budget or depth signal exists
  - use the standard `qc-flow` rules in this document
- `deep`:
  - use only when ambiguity, architecture risk, or verification uncertainty clearly justify the extra prompt cost
  - allow fuller research, richer rationale, and slower handoff

Selection rules:
- if the user explicitly asks for budget-sensitive behavior, choose `lean`
- if the task is clearly risky but still needs planning, choose `deep`
- otherwise choose `balanced`

Lean mode rules:
- keep artifacts only as detailed as needed to resume safely
- prefer updating `Resume Digest` before expanding other sections
- do not restate unchanged baseline sections just to preserve formatting symmetry
- stop research as soon as the missing gate item is satisfied
- stop planning as soon as the verify path and next command are clear
- bias toward one small phase or one tightly scoped wave when safe
- hand off to `$qc-lock` early rather than elaborating execution prose inside `qc-flow`

## Compressed handoff

When `qc-flow` hands work to a later `qc-flow` turn or to `$qc-lock`, carry only the minimum state needed for the next safe decision.

Required handoff fields:
- goal
- required outcomes
- current gate
- current phase and wave, or the next active wave if execution is about to start
- remaining blockers
- execution mode when handoff is going to `$qc-lock`
- burn risk and last budget trigger when relevant
- approval strategy when relevant
- next verify
- exact `Recommended next command`

Handoff rules:
- prefer `Resume Digest` plus one short carry-forward note over repeating full artifact sections
- do not restate unchanged baseline, research, or plan sections unless they materially changed
- if handoff is going to `$qc-lock`, point to one tightly scoped wave and one concrete verify path
- if handoff is going to `$qc-lock`, specify `manual` or `auto` explicitly
- use `manual` by default unless the user explicitly wants the agent to keep advancing without waiting
- use `auto` only when the locked wave is clear enough to continue step by step without another user prompt
- if the next step already has enough context in the run file, do not duplicate it in the chat response

Lean-mode handoff:
- emit the compressed handoff payload before any broader explanation
- if only status changed, prefer digest-only handoff
- if burn risk is rising, narrow the handoff to only what is needed for the next step

## Execution mode

`qc-flow` supports two execution modes:
- `manual`
- `auto`

Selection rules:
- default to `manual`
- use `auto` only when the user explicitly asks the agent to keep advancing without waiting for another prompt
- if the user does not specify, stay in `manual`

Mode behavior:
- `manual`:
  - stop at the current safe checkpoint
  - emit the next concrete command or gate transition
  - wait for the user before advancing further
- `auto`:
  - continue across gates, waves, and phase boundaries when the next step is already clear
  - keep going until the run is complete or a real blocker appears
  - stop only when:
    - the run is complete
    - a relock or plan revision is required
    - approval or escalation is required and cannot be completed immediately
    - requirements change or ambiguity reopens a gate
    - session, context, or burn risk requires a checkpoint and safe stop
    - the user interrupts or changes direction

Auto-mode guardrails:
- do not skip workflow gates just because continuation is automatic
- after each completed wave or phase, update the run file before continuing
- in `auto`, prefer short checkpoint transitions over broad recap prose
- if the next safe move is not explicit, stop and emit a concrete blocker or next command

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
- execution mode
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

## Active run discovery

For project-level resume after a clean session, maintain a small companion state file:
- `.quick-codex-flow/STATE.md`

This state file does not replace the run file.
It only tells `qc-flow` which run should be treated as current when the user does not provide a run path explicitly.

Keep `STATE.md` minimal:
- active run path
- current gate
- current phase and wave
- execution mode
- status: `active` | `paused` | `blocked` | `done`

Discovery rules when the user does not provide `resume from <run-file>`:
1. If `.quick-codex-flow/STATE.md` exists and its `Active run` points to a non-`done` run, use that run.
2. Otherwise scan `.quick-codex-flow/*.md` for non-`done` runs, excluding `STATE.md`.
3. If exactly one non-`done` run exists, use it.
4. If more than one plausible run exists, do not guess from chat memory alone.
5. Use timestamps only as a last fallback when the result is still unambiguous.

Mode-aware resume rules:
- `manual` and `auto` use the same discovery source
- `manual` may stop after reconstructing the active run and the next safe checkpoint
- `auto` may continue only if the discovered run already makes the next safe move explicit
- if the discovered run is `done`, do not reopen it; emit that no active run remains
- when the active run changes, update `STATE.md` before stopping

## Next-step routing after discovery

After the active run is resolved, route from file state, not from chat memory.

Routing inputs:
- `Current gate`
- `Current phase / wave`
- `Current Status`
- `Blockers`
- `Burn Risk`
- `Approval Strategy`
- `Recommended next command`

Deterministic routing rules:
1. If `Current gate` is `clarify`, `research`, `plan`, or `plan-check`, stay in `qc-flow`.
2. If `Current gate` is `execute` and the current wave is `pending` or `in_progress`, continue only if the wave goal and next verify are explicit.
3. If `Current gate` is `execute` and `Recommended next command` already hands one narrow wave to `$qc-lock`, follow that handoff instead of rebuilding it.
4. If `Current gate` is `phase-close`, finish the phase-close checkpoint before opening the next phase.
5. If `Current gate` is `done`, report that no active run remains.
6. If blockers, approval state, or high risk contradict the apparent next step, stop and emit the blocker instead of guessing.

Mode-specific routing:
- `manual`:
  - reconstruct the active run
  - confirm the next safe checkpoint
  - stop with one concrete next command, even if more work is obvious
- `auto`:
  - reconstruct the active run
  - execute the current routed step
  - continue only while each completed step leaves one explicit safe next move in the run file
  - stop when the route would otherwise need inference instead of explicit file state

## Resume Digest

Every non-trivial run must maintain a compact `Resume Digest` inside the run file.

The digest should be short enough to survive aggressive compaction and fast enough to reread before any deeper artifact sections.

The digest must capture:
- goal
- execution mode
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

In `lean` mode:
- refresh the digest before writing any longer artifact section
- if only status changed, prefer digest-only and status-only updates over repeating prior prose

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

Lean-mode interpretation:
- if quota pressure is explicit, unnecessary restatement counts as workflow risk
- prefer digest-first checkpoints over broad narrative checkpoints

## Burn Risk

`Burn Risk` tracks the chance that the current workflow is wasting scarce quota through repeated, low-signal behavior.

Unlike `Session Risk` or `Context Risk`, `Burn Risk` is not about size alone.
It is about waste: repeated turns, repeated checks, or repeated narration that are not buying enough new signal.

Use `low`, `medium`, or `high`.

Observable triggers:
- `unchanged-state turns`:
  - two or more consecutive turns where the main state did not change, but the workflow still produced broad narration
- `wide verify loops`:
  - rerunning the same broad verify without a narrower hypothesis or a changed plan
- `restatement bloat`:
  - repeating baseline or prior artifact sections that did not materially change
- `failure loops`:
  - repeated fix/verify cycles with little new evidence
- `stalling broad checks`:
  - long or ambiguous checks that still do not isolate the next decision safely

Response rules:
- if `Burn Risk` is `medium`:
  - narrow the next verify
  - switch to digest-first updates
  - avoid opening a new phase unless the current phase is clearly complete
- if `Burn Risk` is `high`:
  - do not open a new phase
  - checkpoint the run file immediately
  - either relock, phase-close, or stop with a concrete `Recommended next command`
- if `Burn Risk` becomes `high` during `lean` mode:
  - prefer hard narrowing over more explanation
  - prefer `$qc-lock` handoff if the remaining work is mostly execution

Non-telemetry rule:
- do not estimate token counts, quota percentages, or hidden model limits
- use only observable workflow behavior when setting `Burn Risk`

## Bounded output hygiene

Large verify output, long logs, and repeated command dumps should be compressed into bounded evidence.

Default bounded-output pattern:
- `Result`: pass | fail | blocked
- `Command or method`: the verify that ran
- `Small evidence`: the smallest lines or facts that justify the result
- `Next action`: what changes because of that result

When output is large:
- prefer a short result summary over raw output
- keep only relevant error lines, failing test names, warning counts, or one short head/tail sample when needed
- if output is clean, say that it passed and avoid dumping the log
- if output is noisy but non-blocking, summarize the noise instead of pasting it
- write the minimum evidence needed into the run file; do not turn the run file into a log archive

Do not:
- paste long command output into chat when a short summary is enough
- repeat the same large output on retry turns
- use "see above" without restating the one fact that matters for the next decision

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

In `lean` mode:
- prefer a single active phase when safe
- collapse answered research into short conclusions
- stop elaborating once the next safe execution command is obvious

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
- for coding tasks, every phase and wave must declare verification that covers build cleanliness and unit-test status for the touched scope
- for non-code tasks, every phase and wave must declare the narrowest concrete verification that proves the artifact change safely

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
- for coding tasks, when a wave or phase verifies cleanly and the worktree is in a coherent state, create a checkpoint commit before opening the next wave or phase
- prefer one logical checkpoint commit per completed wave or per completed phase, not one large multi-wave dump
- if unrelated local changes would make the checkpoint commit noisy or unsafe, stop and surface that instead of forcing a broad commit

Task-type completion rules:
- for coding tasks:
  - a wave is not `done` unless the relevant build for the touched scope is free of errors and warnings
  - a wave is not `done` unless the relevant unit tests for the touched scope pass
  - a phase is not `done` unless its waves satisfy the same build-clean and unit-test-pass requirement for the touched scope
  - prefer the narrowest build and test commands that still cover the edited code safely
- for non-code tasks:
  - choose the smallest concrete verification that matches the artifact being changed
  - record that verification explicitly in the wave or phase artifact

Task-type completion rules:
- for coding tasks:
  - a wave is not `done` unless the relevant build for the touched scope is free of errors and warnings
  - a wave is not `done` unless the relevant unit tests for the touched scope pass
  - a phase is not `done` unless its waves satisfy the same build-clean and unit-test-pass requirement for the touched scope
  - prefer the narrowest build and test commands that still cover the edited code safely
- for non-code tasks:
  - choose the smallest concrete verification that matches the artifact being changed
  - record that verification explicitly in the wave or phase artifact

If implementation reveals a missing task that changes scope or dependencies, stop and return to plan check.

Compressed execution handoff:
- when handing an execution-ready wave to `$qc-lock`, carry only the active wave goal, touched scope, verify path, blockers, burn risk, and next command
- include the intended `qc-lock` execution mode in that handoff: `manual` or `auto`
- prefer one-wave handoff over repeating the whole phase table when the phase structure has not changed

Mode-aware execution:
- in `auto`, if the current wave verifies cleanly and the next wave or phase is already defined, continue without waiting for another user message
- in `manual`, stop at the current safe wave or phase checkpoint even if the next step is obvious

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

Burn-risk connection:
- repeated thrash without new evidence raises `Burn Risk`
- after the second failed verify in the same wave, reassess `Burn Risk` before trying again

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

Burn-risk connection:
- a stalled broad check is both a stall problem and a burn-risk trigger
- after the first stall, reassess `Burn Risk` before starting another broad check

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

Burn-risk connection:
- when approval is likely, prefer the smallest pre-approval check that can change the next decision
- do not spend extra turns narrating why an escalated check might help if a concrete narrow check is still available

## Resume protocol

When resuming:

1. If the user provided a run path, read that run file.
2. Otherwise resolve the active run from `.quick-codex-flow/STATE.md` or the deterministic fallback rules.
3. Read the `Resume Digest` first.
4. Check `Session Risk` and `Context Risk`.
5. Check `Burn Risk`.
6. Restate:
   - current gate
   - original goal
   - execution mode
   - required outcomes
   - current phase
   - current wave
   - remaining blockers
   - stall status
   - approval strategy
   - burn risk
   - next verify
7. Continue only after restating this state.

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
- a run is not safely resumable if `Burn Risk` is stale after a thrash, stall, or narrow-to-stop decision
- for coding tasks, a phase close or final `done` state is incomplete unless it states whether the relevant build was free of errors and warnings and whether the relevant unit tests passed for the touched scope
- in `manual`, a safe checkpoint may end with a next command even when more work is obvious
- in `auto`, do not stop at a safe checkpoint if the next step is already clear and no blocker is present

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

Mode-specific response behavior:
- in `manual`, stop at the current safe checkpoint and emit the next concrete command
- in `auto`, continue to the next gate, wave, or phase when the next safe move is already clear
- in both modes, stop immediately when relock, approval, or ambiguity prevents safe continuation

For coding tasks, `Verification result` and phase-close summaries must say whether:
- the relevant build passed with no errors and no warnings in the touched scope
- the relevant unit tests for the touched scope passed

For large verify output, `Verification result` should use the bounded-output pattern:
- result
- command or method
- smallest relevant evidence
- next action

`Recommended next command` rules:
- recommend the exact next skill to use
- prefer `$qc-flow` when staying in the same run file or changing gates
- recommend `$qc-lock` only when the verified plan is already clear and the handoff target is one tightly scoped wave
- include a concrete command or prompt line the user can paste
- if recommending `$qc-lock`, state whether it should run in `manual` or `auto`
- if both options are viable, recommend one first and mention the alternative briefly
- treat this field as required, not optional, whenever the next step is already knowable from the current run state

Keep responses concise. The artifacts carry the long-term state.

In `lean` mode:
- compress each section to the minimum needed to preserve gate, verify path, and next action
- omit inactive sections instead of filling them with placeholders
- prefer short prose over tables unless the table materially reduces ambiguity
- if the run file already contains stable context, do not restate it in full
- prefer compressed handoff fields over broad summaries
- prefer bounded verify evidence over pasted logs

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
