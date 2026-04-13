---
name: "qc-lock"
description: "Use when the user wants Codex to work in a strict, auditable loop: write a short explicit plan, lock it, execute one step at a time, verify each step, and fix failures before moving on. Best for coding tasks where scope drift and weak orchestration are the main risks. Works alone, and works better with Experience Engine hooks by folding relevant warnings into the current locked step instead of silently ignoring them."
---

# Quick Codex Lock

Use this skill when the user wants a narrow, reliable execution loop rather than broad autonomous orchestration.

This skill is designed for small context windows. It externalizes state into a persistent run artifact so the task can survive long sessions, many turns, and phase handoffs without losing the original requirements.

Philosophy:
- Single is good: the workflow must work without any external service.
- Best together: when Experience Engine hooks surface a relevant warning, use it to strengthen the current step's implementation or verification instead of treating it as noise.

## When to use

Use this skill for:
- multi-step coding work where the plan must stay short and explicit
- tasks that need strong scope control
- work where each step should be verified before the next starts
- cases where Codex tends to drift or over-orchestrate

Do not use this skill for:
- trivial one-shot edits
- open-ended exploration with no clear execution target
- work where the user explicitly wants broad autonomous planning

## Required loop

Follow this sequence exactly:

1. PLAN
2. LOCK
3. EXECUTE one step
4. TEST / VERIFY that step
5. FIX the same step if verification fails
6. Repeat from step 3 until all locked steps are done

Never skip verification.
Never advance past a failing step.
Never expand scope without relocking.

## Execution mode

`qc-lock` supports two execution modes:
- `manual`
- `auto`

Selection rules:
- default to `manual`
- use `auto` only when the user explicitly asks the agent to keep going step by step without waiting for another user prompt
- if the user does not specify, stay in `manual`

Mode behavior:
- `manual`:
  - finish the current safe checkpoint
  - report status
  - emit the next concrete step or recommended command
  - wait for the user before advancing further
- `auto`:
  - after a step is verified, immediately advance to the next locked step
  - keep going until the locked plan or current phase is done
  - stop only when:
    - the locked plan is complete
    - verification fails and the current step becomes blocked
    - a relock is required
    - approval or escalation is required and cannot be completed immediately
    - the user interrupts or changes direction

Auto-mode guardrails:
- do not skip step-by-step verification just because continuation is automatic
- do not silently expand scope; if auto mode reaches out-of-lock work, stop and relock
- after each completed step, update the run file before moving to the next one
- in `auto`, prefer short status transitions over long narrative recaps between steps

## Lean Budget handoff

`qc-lock` is the preferred execution target after a successful `qc-flow` run in `lean` mode.

Profiles:
- `lean`:
  - use when the plan is clear and quota pressure matters
  - keep the lock short, the progress updates terse, and the verification step-local first
  - restate only the minimum needed to resume safely
- `balanced`:
  - default behavior when no strong budget or depth signal exists
  - use the normal lock discipline in this document
- `deep`:
  - use when implementation risk or verification uncertainty still justifies extra rationale
  - allow richer notes, broader verify, and more explicit invariants

Handoff rules:
- if a `qc-flow` run reaches plan-check with `lean` mode and the remaining work is mostly execution, prefer `$qc-lock`
- once handed off, do not bounce back to `qc-flow` unless scope, dependencies, or required outcomes materially change

Burn Risk handoff:
- treat `Burn Risk` from `qc-flow` as execution guidance, not as hidden quota math
- carry forward the latest observable trigger when present:
  - `unchanged-state turns`
  - `wide verify loop`
  - `restatement bloat`
  - `failure loop`
  - `stalled broad check`
- if handed off with `Burn Risk: medium`:
  - keep the next step narrow
  - verify step-local first
  - keep progress updates terse
- if handed off with `Burn Risk: high`:
  - do not broaden scope
  - checkpoint the lock artifact before another broad check
  - either relock to a smaller step, stop with a concrete blocker, or hand back to `qc-flow` only if scope truly changed
- do not invent token estimates, quota percentages, or hidden model limits inside `qc-lock`

Compressed handoff:
- when `qc-lock` receives a handoff from `qc-flow`, carry only:
  - original goal
  - execution mode
  - current phase
  - current locked step or next pending step
  - touched scope
  - remaining blockers
  - burn risk and last trigger when relevant
  - next verify
  - next action
- prefer a short carry-forward note over repeating the whole lock history
- if the run file already contains stable context, do not restate completed steps in chat

## Persistent state

For any task larger than a trivial one-shot edit, create and maintain a persistent run file.

Recommended path:
- `.quick-codex-lock/<task-slug>.md`

The run file is the source of truth across turns. Do not rely on chat context alone.

The run file must preserve:
- original user goal
- required outcomes from the start
- non-goals and exclusions
- execution mode
- phase list
- locked plan for the current phase
- verification evidence
- unresolved risks and blockers

Before starting a new phase or resuming after a pause, reread the run file first.

## Requirement baseline

At the top of the run file, capture a stable baseline before execution starts.

This baseline must include:
- `Original goal`
- `Required outcomes`
- `Constraints`
- `Out of scope`
- `Definition of done`

Rules:
- keep these items stable unless the user changes them
- never silently rewrite the original requirement
- every future phase must trace back to these baseline items
- if a discovered task does not map back to the baseline, it is not in scope until relocked

## Phase model

Split non-trivial work into phases.

Each phase must have:
- `phase_id`
- `purpose`
- `depends_on`
- `covers_requirements`
- `exit_criteria`
- `verify`

Phase rules:
- each phase should be independently understandable from the run file
- before starting a phase, restate which baseline requirements it covers
- after finishing a phase, record what remains unchanged from the original requirements
- if a later phase would compromise an earlier required outcome, stop and relock
- for coding tasks, do not mark a phase `done` unless the relevant build is free of errors and warnings in the touched scope, and the relevant unit tests for the touched scope are passing
- for non-code tasks, choose the narrowest concrete verification that proves the phase outcome safely

## Step rules

### 1. PLAN

Create a short plan with 3 to 7 steps for the current phase.

Mode guidance:
- `lean`: prefer 3 to 5 steps
- `balanced`: prefer 3 to 5 steps
- `deep`: use 5 to 7 only when the extra detail materially reduces execution risk

Each step must contain:
- `id`
- `change`
- `done_when`
- `verify`

Keep step text short. Each step should be executable in one focused pass.

For multi-phase work, the plan must include:
- a phase list first
- one locked step plan only for the current phase

### 2. LOCK

Emit a `Locked Plan` block using the template in [references/locked-plan-template.md](references/locked-plan-template.md).
Write or update the same lock in the persistent run file.

Lock rules:
- mark every step as `pending`, `in_progress`, `done`, or `blocked`
- do not add, remove, merge, or reorder steps after lock
- if scope changes materially, replace the full lock block and clearly state `Relocked`
- if a new issue appears during execution, first decide whether it is:
  - required to finish the current step safely
  - unrelated scope that must wait for a relock
- keep the current execution mode visible in the run file when the task spans multiple turns

### 3. EXECUTE

Work on one locked step at a time.

Before editing, state:
- current step id
- current phase id
- expected files to touch
- verification command or method for that step

Prefer the smallest edit that can complete the step.
After each meaningful step, update the run file so a later turn can resume without reconstructing state from memory.

In `auto` mode:
- if the current step verifies cleanly, move to the next `pending` locked step without waiting for another user message
- if the next step depends on a relock, approval, or clarified scope, stop and surface that blocker explicitly

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
- write only the minimum evidence needed into the run file; do not turn the lock artifact into a log archive

### 4. TEST / VERIFY

Run the smallest reliable verification for the current step first.

Verification order:
- step-local checks first
- integration checks second
- broad suite last, when useful

Task-type verification rules:
- for coding tasks:
  - a step is not `done` unless its declared verification passes
  - a phase or wave is not `done` unless the affected code builds with no errors and no warnings in the touched scope
  - a phase or wave is not `done` unless the relevant unit tests for the touched scope pass
  - prefer the narrowest build and test commands that still cover the edited code safely
- for non-code tasks:
  - choose the smallest concrete verification that matches the artifact being changed
  - state that verification explicitly in the locked step or phase `verify` field

In `lean` mode:
- do not jump to broad verification if a smaller check can prove the step safely
- summarize verify results tersely unless the failure changes the locked plan

A step is not `done` until its declared verification passes.
A phase is not `done` until its exit criteria and phase verification pass.
For coding tasks, "verification passes" includes build-clean and unit-test-pass requirements for the touched scope.

### 5. FIX

If verification fails:
- stay on the same step
- state the failure briefly
- state one concrete hypothesis
- apply the smallest fix that tests that hypothesis
- rerun verification

If the same step fails repeatedly:
- after the second failed verify, either produce new evidence or relock the plan
- after the third failed verify, stop, mark the step `blocked`, and surface the blocker or wrong assumption instead of thrashing

Do not keep applying speculative fixes without a changed hypothesis.

Burn-risk connection:
- repeated failed verifies without new evidence raise burn risk even if the locked step is still technically in scope
- after the second failed verify, prefer relocking to a smaller step before trying another broad fix

## Resume protocol

When continuing existing work:

1. Read the persistent run file first.
2. Restate:
   - original goal
   - execution mode
   - current phase
   - remaining required outcomes
   - current locked step
3. Only then continue execution.

If the run file and chat context disagree, trust the run file unless the user explicitly changed direction.

In `lean` mode:
- restate only the original goal, current phase, current locked step, and next verify unless a relock happened
- if resuming with `Burn Risk: high`, restate the last budget trigger before continuing

## Anti-drift rules

Use these rules to prevent context loss:
- every phase must reference the initial required outcomes
- every relock must restate what remains invariant
- every completion summary must include `requirements still satisfied`
- do not replace old intent with newly discovered local optimizations
- do not let failing tests or implementation friction redefine the goal
- if uncertain, reread the run file and anchor on the baseline

Quota-aware stop conditions:
- if the next verify is still broad after two failed or stalled attempts, relock before continuing
- if the current step can no longer produce a narrow verify, stop and surface the blocker instead of narrating more options
- if the safest next move is obviously a new phase or changed dependency, stop and hand back to `qc-flow`

Mode-aware stop rule:
- in `auto`, stop at the first real blocker instead of looping for user-like confirmation
- in `manual`, stop at the current safe checkpoint even if the next step is already obvious

## Experience Engine integration

This skill must remain useful even if `experience-engine` is unavailable.

When Experience Engine hooks are active:
- treat high-confidence warnings as current-step risk input
- use the `Why:` line to strengthen implementation or verification
- if a warning changes the safe execution path, update the current step notes before editing
- route the warning into the locked step where possible:
  - `Risks`
  - `Invariant requirements`
  - `Verify`

Do not depend on direct API calls to make this skill work.

Prefer this order:
1. let hooks surface warnings automatically
2. incorporate relevant warnings into the locked step
3. report repeated noisy warnings instead of silently ignoring them

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

Use direct `experience-engine` API calls only when the user explicitly wants to inspect or debug the engine behavior.

## Output contract

Use this structure in responses:

1. Short `Plan` section
2. `Requirement Baseline` summary when starting or relocking
3. `Locked Plan` block
4. Per-step progress updates:
   - `Step`
   - `Phase`
   - `Files`
   - `Verify`
   - `Result`
5. Final outcome with verification status and remaining requirements

Mode-specific response behavior:
- in `manual`, end at the current safe checkpoint and tell the user the next locked step
- in `auto`, continue through the next locked step automatically instead of waiting for a pasted follow-up command
- in both modes, stop and surface blockers immediately when verification, relock, or approval gates prevent safe continuation

For large verify output, per-step updates and final outcome should use the bounded-output pattern:
- result
- command or method
- smallest relevant evidence
- next action

For coding tasks, the final outcome must say whether:
- the relevant build passed with no errors and no warnings in the touched scope
- the relevant unit tests for the touched scope passed

Keep commentary concise. The lock block is the authoritative state.

In `lean` mode:
- keep per-step updates short
- surface only changed files, the active verify, and the result
- avoid reprinting the full baseline unless relocking

## References

Read these only when needed:
- [references/locked-plan-template.md](references/locked-plan-template.md) for the lock format and a compact example
- [references/run-file-template.md](references/run-file-template.md) for the persistent artifact format used across turns
