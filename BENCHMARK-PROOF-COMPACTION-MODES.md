# Benchmark Proof: Compaction Modes

Goal:
- verify the actual operator-facing behavior for `/compact`, `/clear`, and `relock`
- prove the mode is derived from route semantics, not only from prose in the docs
- show the validator accepts the resulting handoff in each mode

## Setup

Repo under test:
- `quick-codex`

Command baseline:
- `npm test`
  - result: `28/28` tests passed after adding native `independent-next-phase -> clear` coverage

Fixtures used:
- `routedWaveRun` for same-phase routing
- `independentPhaseRun` for phase close into an independent next phase
- `verifiedWaveRun` for phase close that still requires relock

Execution method:
- create a temp project with a real `.quick-codex-flow/sample.md`
- run `quick-codex close-wave`
- run `quick-codex doctor-run`

## Scenario A: Same-Phase -> `/compact`

Purpose:
- verify that an explicit next wave in the same phase produces compact-style guidance

Observed `close-wave` result:
- `Current gate: execute`
- `Next-wave pack: P1 / W2`
- `Brain verdict: allow-compact (high)`

Observed `doctor-run` result:
- `Handoff sufficiency: 31/31 (same-phase -> compact)`
- `Handoff mode: same-phase next-wave pack required`

Interpretation:
- this is the healthiest `/compact` case
- the next route is explicit
- the packet to keep is narrow and deterministic

## Scenario B: Independent Next Phase -> `/clear`

Purpose:
- verify that phase close can now derive a clear-style handoff when the next pending phase does not depend on the current phase

Observed `close-wave --phase-done` result:
- `Current gate: phase-close`
- `Brain verdict: allow-clear (high)`

Observed `doctor-run` result:
- `Handoff sufficiency: 23/23 (independent-next-phase -> clear)`

Interpretation:
- `/clear` is appropriate only when the next phase is actually independent
- the protocol now has a natural route to this state through `close-wave --phase-done`
- this is stricter than generic "finished phase, therefore clear" logic

## Scenario C: Phase Close Still Needs Relock

Purpose:
- verify that phase close blocks both `/compact` and `/clear` when the next route is not yet safely locked

Observed `close-wave --phase-done` result:
- `Current gate: phase-close`
- `Brain verdict: relock-first (high)`

Observed `doctor-run` result:
- `Handoff sufficiency: 23/23 (relock-before-next-phase -> relock)`

Interpretation:
- this is the safety catch
- Quick Codex refuses to pretend a risky phase boundary is a compaction problem
- the next action is relock, not session cleanup

## What This Proves

This proof supports a narrow claim:

`Quick Codex now has a validator-backed three-way checkpoint model for same-phase compact, independent-phase clear, and relock-before-next-phase.`

More specifically:
- `/compact` is for same-phase or carry-forward-heavy routes
- `/clear` is for truly independent phase boundaries
- relock is the default safety branch when the next phase is not yet safely determined

## Practical Evaluation

`/compact`:
- strongest mode today
- natural fit for multi-wave execution
- best when `Next Wave Pack` exists

`/clear`:
- should stay rare
- valuable, but only if independence is explicit
- dangerous if inferred too loosely

`relock`:
- not a failure state
- it is the protocol's guard against fake confidence at a phase boundary

## What This Does Not Yet Prove

This proof does not yet prove:
- that every future repo will encode independence cleanly in the phase table
- that users will always maintain `Depends on` accurately in the verified plan
- direct productivity gains from choosing `/clear` less often than `/compact`
