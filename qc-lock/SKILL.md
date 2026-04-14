---
name: "qc-lock"
description: "Use when the user wants Codex to work in a strict, auditable loop: verify preflight context, write a short explicit plan, lock it, execute one step at a time, verify each step, and fix failures before moving on. Best for coding tasks where scope drift and weak orchestration are the main risks. Works alone, and works better with Experience Engine hooks by folding relevant warnings into the current locked step instead of silently ignoring them."
---

# Quick Codex Lock

Use this skill when the user wants a narrow, reliable execution loop rather than broad autonomous orchestration.

This skill is designed for small context windows. It externalizes state into a persistent run artifact so the task can survive long sessions, many turns, and phase handoffs without losing the original requirements.

This skill is strongest after `qc-flow` has already clarified the task, surfaced the affected area, and produced evidence for planning.
It may still run standalone, but only after a short preflight that proves the lock is safe.

Philosophy:
- Single is good: the workflow must work without any external service.
- Best together: when Experience Engine hooks surface a relevant warning, use it to strengthen the current step's implementation or verification instead of treating it as noise.

## When to use

Use this skill for:
- multi-step coding work where the plan must stay short and explicit
- tasks that need strong scope control
- work where each step should be verified before the next starts
- cases where Codex tends to drift or over-orchestrate
- execution-ready work where the affected area is already understood or can be proven quickly

Do not use this skill for:
- trivial one-shot edits
- open-ended exploration with no clear execution target
- work where the user explicitly wants broad autonomous planning

## Required preflight

Before `PLAN`, decide whether upstream planning is already trustworthy.

Trusted upstream inputs may be:
- an existing `qc-flow` run with a verified plan
- another explicit artifact that already captures goal, requirements, affected area, and evidence basis

If no such artifact exists, `qc-lock` must do a short preflight before locking:
- clarify the execution target and required outcomes
- surface the affected area and blast radius
- identify likely files and protected boundaries
- do targeted research for any unknown repo area, contract, or verify path

Preflight pass conditions:
- execution target is narrow enough to lock
- affected area is explicit
- verify path is explicit
- evidence is sufficient for the proposed lock

If these are not true, do not lock yet.
Either keep researching or hand the task back to `$qc-flow`.

Gray-area rule:
- if the task still has an unresolved gray area, `qc-lock` is not allowed to convert that ambiguity into a lock
- gray area about user intent or success conditions -> hand back to `$qc-flow`
- gray area about repo facts, contracts, or verify path -> keep preflight active and keep researching
- only lock when the remaining uncertainty is operational detail inside an already-proven scope

## Required loop

Follow this sequence exactly:

1. PREFLIGHT if upstream context is not already verified
2. PLAN
3. LOCK
4. EXECUTE one step
5. TEST / VERIFY that step
6. FIX the same step if verification fails
7. Repeat from step 4 until all locked steps are done

Never skip verification.
Never advance past a failing step.
Never expand scope without relocking.
Never lock from a fuzzy affected area.
Never lock while a gray-area trigger is still active.

## Persistent state

For any task larger than a trivial one-shot edit, create and maintain a persistent run file.

Recommended path:
- `.quick-codex-lock/<task-slug>.md`

The run file is the source of truth across turns. Do not rely on chat context alone.

The run file must preserve:
- original user goal
- required outcomes from the start
- affected area and protected boundaries
- non-goals and exclusions
- evidence basis for the current lock
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
- `Affected area`
- `Constraints`
- `Out of scope`
- `Definition of done`

Rules:
- keep these items stable unless the user changes them
- never silently rewrite the original requirement
- every future phase must trace back to these baseline items
- do not silently widen the affected area after lock
- if a discovered task does not map back to the baseline, it is not in scope until relocked

## Phase model

Split non-trivial work into phases.

Each phase must have:
- `phase_id`
- `purpose`
- `depends_on`
- `covers_requirements`
- `covers_affected_area`
- `exit_criteria`
- `verify`

Phase rules:
- each phase should be independently understandable from the run file
- before starting a phase, restate which baseline requirements it covers
- before starting a phase, restate which affected area it is allowed to touch
- after finishing a phase, record what remains unchanged from the original requirements
- if a later phase would compromise an earlier required outcome, stop and relock

## Step rules

### 1. PLAN

Create a short plan with 3 to 7 steps for the current phase.

Each step must contain:
- `id`
- `change`
- `done_when`
- `verify`

Keep step text short. Each step should be executable in one focused pass.

For multi-phase work, the plan must include:
- a phase list first
- one locked step plan only for the current phase

Planning rules:
- cite the evidence or upstream artifact that justifies the lock
- name the touched scope and protected boundaries explicitly
- if the affected area is still uncertain, stop and keep preflight active

### 2. LOCK

Emit a `Locked Plan` block using the template in [references/locked-plan-template.md](references/locked-plan-template.md).
Write or update the same lock in the persistent run file.

Lock rules:
- mark every step as `pending`, `in_progress`, `done`, or `blocked`
- do not add, remove, merge, or reorder steps after lock
- if scope changes materially, replace the full lock block and clearly state `Relocked`
- if the affected area changes materially, replace the full lock block and clearly state `Relocked`
- if a new issue appears during execution, first decide whether it is:
  - required to finish the current step safely
  - unrelated scope that must wait for a relock

### 3. EXECUTE

Work on one locked step at a time.

Before editing, state:
- current step id
- current phase id
- expected files to touch
- affected area this step is allowed to touch
- verification command or method for that step

Prefer the smallest edit that can complete the step.
After each meaningful step, update the run file so a later turn can resume without reconstructing state from memory.

### 4. TEST / VERIFY

Run the smallest reliable verification for the current step first.

Verification order:
- step-local checks first
- integration checks second
- broad suite last, when useful

A step is not `done` until its declared verification passes.
A phase is not `done` until its exit criteria and phase verification pass.

Git hygiene:
- when a verified step closes a coherent wave or phase, create a checkpoint commit before starting the next one
- prefer small commits that map cleanly to the locked work instead of letting the worktree accumulate unrelated noise
- if unrelated local edits make that commit unsafe, stop and surface the issue instead of bundling mixed changes

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

## Resume protocol

When continuing existing work:

1. Read the persistent run file first.
2. Restate:
   - original goal
   - current phase
   - remaining required outcomes
   - affected area
   - evidence basis for the current lock
   - current locked step
3. Only then continue execution.

If the run file and chat context disagree, trust the run file unless the user explicitly changed direction.

## Anti-drift rules

Use these rules to prevent context loss:
- every phase must reference the initial required outcomes
- every relock must restate what remains invariant
- every completion summary must include `requirements still satisfied`
- every relock must restate the affected area that remains in scope
- do not replace old intent with newly discovered local optimizations
- do not let failing tests or implementation friction redefine the goal
- if uncertain, reread the run file and anchor on the baseline

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
exp-feedback ignored xxxx col-name
exp-feedback noise xxxx col-name wrong_task
```

Replace `xxxx` and `col-name` from the hook suffix:

```text
[id:xxxx col:name]
```

Raw verdict API form is still available when needed:

```bash
curl -s -X POST http://localhost:8082/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"pointId":"xxxx","collection":"col-name","verdict":"IGNORED"}'
```

Use direct `experience-engine` API calls only when the user explicitly wants to inspect or debug the engine behavior.

## Output contract

Use this structure in responses:

1. `Preflight` status when upstream planning is missing or weak
2. Short `Plan` section
3. `Requirement Baseline` summary when starting or relocking
4. `Locked Plan` block
5. Per-step progress updates:
   - `Step`
   - `Phase`
   - `Files`
   - `Affected area`
   - `Verify`
   - `Result`
6. Final outcome with verification status and remaining requirements

Keep commentary concise. The lock block is the authoritative state.

## References

Read these only when needed:
- [references/locked-plan-template.md](references/locked-plan-template.md) for the lock format and a compact example
- [references/run-file-template.md](references/run-file-template.md) for the persistent artifact format used across turns
