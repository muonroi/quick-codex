---
name: "qc-lock"
description: "Execute one narrow wave with explicit scope, current evidence, and verification after each meaningful step. Use when the target, affected area, protected boundaries, and verification path are already proven; otherwise use qc-flow."
---

# Quick Codex Lock

Lock one execution-ready wave, execute one step at a time, verify, and fix before
advancing. Keep the run as the source of truth; the loop works without external
services or delegated agents.

## Preflight

Read the owner run or inspect the exact target. Confirm the goal, affected files,
protected contracts, evidence basis, and verification path. An upstream verified
plan can supply these; do not rediscover unchanged facts.

If a requirement, contract, ownership, or verify path is unresolved, return the
dependent work to `qc-flow` or keep researching before locking. Never convert a
gray area into an assumption. Continue independent authorized steps when their
scope and evidence remain clear.

## State and scope

Prefer the existing flow run and its active wave; a handoff does not require a
second plan or lock artifact. For standalone locks use
`.quick-codex-flow/sessions/<thread-id>/locks/<task-slug>.md` and
[the lock template](references/run-file-template.md). Use the trusted thread ID
or explicit `--session`; never combine sessions or guess among active artifacts.
Legacy flat lock artifacts remain supported with explicit `--legacy` selection.

`Current Status` owns current state for lean runs. `STATE.md` holds discovery
pointers only. Keep immutable scope and contracts separate from current status;
move superseded notes to History. Expanded legacy lock fields remain compatible.
A native planner may mirror the active steps, without becoming another authority.

## Loop

1. **PLAN**: name the next step, files, expected result, and concrete verification.
   Detail only this wave; future milestones need a short goal and dependency.
2. **LOCK**: confirm scope, requirements, protected boundaries, current evidence,
   and verification groups. Record the lock in the owner run.
3. **EXECUTE**: make the scoped change. Do not open adjacent cleanup by habit.
4. **VERIFY**: run the declared checks and capture observable results. A self-rating
   or a successful unrelated build cannot satisfy a behavior group.
5. **FIX**: repair failures within the lock and rerun affected checks. If the fix
   changes a protected contract or scope, relock after resolving that dependency.

Use the flow run's `Verification Plan` table (`Group | Kind | Command`) for
machine gates. Enumerate relevant behavior paths. Preflight infrastructure first,
reuse a shared build for identical inputs, and use `test --no-build` only with
matching built outputs. Keep checks sequential or explicitly bound concurrency;
do not compete for shared build outputs. Stop a broad suite when its prerequisite
fails. Retry only after a changed input or a concrete unresolved concern.

`quick-codex verify-wave --run <path>` runs grouped checks sequentially, deduplicates
commands, and records a receipt. Commands have a two-minute timeout and 1 MiB
output limit. The receipt binds the plan/wave and Git working source; non-Git runs
bind only the plan and are explicitly `unversioned`. Keep generated outputs ignored.
`close-wave` requires every planned command to pass against current inputs and any
assigned reviewer panel to clear. Old failed attempts remain recorded; the latest
successful result determines the current command outcome.

Distinguish source, build, tests, package consumers, and deployed runtime proof.
State actual build errors/warnings and relevant test results. An unavailable
infrastructure check stays unavailable; it is never a pass.

## Continuation and completion

Honor the user's authorization and existing decisions. Finish authorized work
through verification without asking again at routine checkpoints. `manual` is
for requested checkpoints; otherwise continue clear authorized steps. Ask only
for missing intent, scope, or authority, and block only the dependent portion.

Update the owner run after meaningful transitions. On resume, read current state,
active scope, invariants, proof, blockers, and next verify before continuing. Carry
only those fields across compaction. Preserve required reviewer/delegation gates
when assigned; delegation is not an automatic prerequisite for ordinary work.

At wave close, summarize observed evidence and update current status in place.
Use `--phase-done` only when the phase outcomes have been verified. Plan the next
wave when its inputs exist. End with an exact continuation command only when
planning-only, blocked, deferred, or intentionally paused; otherwise keep working.

Experience Engine hints are optional evidence inputs. Verify them against current
code, preserve relevant invariants, and use the installed `exp-feedback.js` helper
for verdicts. Do not hardcode brain endpoints or credentials.

## References

- [Run template](references/run-file-template.md): standalone lock artifact.
- [Locked plan](references/locked-plan-template.md): expanded step detail if needed.
