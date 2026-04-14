# Benchmarks

Quick Codex should be judged on workflow reliability, not on how many skills it ships.

Use these scenarios to compare raw Codex usage against Quick Codex on the pain points it is meant to solve.

Current proof set:
- [BENCHMARK-PROOF-DRIFT.md](./BENCHMARK-PROOF-DRIFT.md)
- [BENCHMARK-PROOF.md](./BENCHMARK-PROOF.md)
- [BENCHMARK-PROOF-THRASH.md](./BENCHMARK-PROOF-THRASH.md)
- [BENCHMARK-PROOF-FAILURE.md](./BENCHMARK-PROOF-FAILURE.md)
- [BENCHMARK-PROOF-POSITIONING.md](./BENCHMARK-PROOF-POSITIONING.md)
- [BENCHMARK-PROOF-WORKFLOW-HARDENING.md](./BENCHMARK-PROOF-WORKFLOW-HARDENING.md)

## 1. Multi-turn Drift

Goal:
- measure whether a medium task still has a clear next step after 8 to 12 turns

Setup:
- choose a feature or bug fix that spans multiple files
- run once with raw Codex usage
- run once with `qc-flow`

Compare:
- was the current goal still explicit at turn 8
- was the next verify still explicit at turn 8
- did the workflow reopen scope without saying so
- could another engineer resume from the artifact without reading the whole transcript

Expected Quick Codex advantage:
- the run file still holds the active gate, next verify, blockers, and next command

## 2. Resume After Interruption

Goal:
- measure how reliably work resumes after a pause, restart, or stale session state

Setup:
- start a non-trivial task
- stop after planning or mid-execution
- resume from a fresh session

Compare:
- time to recover the active task
- number of turns spent reconstructing context
- whether the resumed workflow chose the right gate
- whether the next prompt was obvious without rereading the whole thread

Expected Quick Codex advantage:
- `STATE.md`, the run file, `quick-codex status`, and `quick-codex resume` should reduce recovery to one read and one pasteable prompt

## 3. Verification Thrash

Goal:
- measure whether the workflow keeps rerunning broad checks without narrowing the hypothesis

Setup:
- choose a task where the first fix attempt is likely to fail
- run once with raw Codex usage
- run once with `qc-lock` or execution-ready `qc-flow`

Compare:
- how many repeated verifies ran without a changed hypothesis
- whether verification narrowed after the first failure
- whether the workflow stopped after repeated failures instead of thrashing

Expected Quick Codex advantage:
- anti-thrash and burn-risk rules should force narrower verification or a relock

## 4. Failure Recovery

Goal:
- measure whether the workflow still leaves usable state when execution gets awkward

Setup:
- force one of these cases:
  - a long-running verify that stalls
  - a step that needs escalation
  - a blocked step where the next command is not yet approved

Compare:
- whether the workflow records the blocker clearly
- whether the artifact preserves a safe next command
- whether the next session can continue without guessing

Expected Quick Codex advantage:
- the run file should retain stall state, approval strategy, blockers, and a concrete next command

## 5. Positioning Test

Goal:
- verify that the package is understandable by a new Codex CLI user in pain-point language

Ask a user to find the answer to these without extra coaching:
- What do I use if Codex keeps losing the thread?
- What do I use if I want a step-by-step fix with verification?
- What do I use if I am returning after two days?
- What do I run if I do not trust the current run artifact?

Expected Quick Codex advantage:
- the README, quickstart, task selection, and examples should answer these directly

## 6. Workflow Hardening

Goal:
- verify that the workflow now forces front-half discipline where the older wording was too soft

Setup:
- choose a task that changes the workflow rules themselves
- require the task to update both skill text and public docs/templates
- validate the result through a real run artifact instead of doc review alone

Compare:
- does `qc-flow` require affected-area discussion before plan
- does `qc-flow` require evidence or an explicit research-skip rationale before plan
- does `qc-lock` require preflight when upstream planning is weak
- do public docs and scaffolds teach the same stricter workflow

Expected Quick Codex advantage:
- the package surface should now align the skill rules, docs, and scaffolded artifacts around the same stricter front-half gates
