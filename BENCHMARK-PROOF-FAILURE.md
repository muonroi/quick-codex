# Benchmark Proof — Failure Recovery

This document captures one concrete proof scenario from [BENCHMARKS.md](./BENCHMARKS.md).

It is intentionally narrow.
The goal is to show one real failure-recovery behavior from the `quick-codex` implementation sequence, not to claim coverage of every blocked or stalled execution case.

## Scenario

Benchmark:
- `Failure Recovery`

Pain point:
- "The workflow hit an awkward state, and I need usable next-step state instead of vague narration."

Repo under test:
- `quick-codex`

Task under test:
- the package evolution run where the new recovery commands and artifact parser were being implemented

## Observed Failure-Recovery Case

One observed recovery failure was artifact-health related:

`node quick-codex/bin/quick-codex.js doctor-run --dir /mnt/d/Personal/Core`

initially failed because the active run artifact did not expose enough state for safe resume under the new contract.

The reported failures were explicit:
- missing `Execution mode`
- missing `Burn Risk`
- missing `Approval Strategy`

This mattered because `doctor-run` is intended to answer:
- is the artifact resumable
- is the current state trustworthy
- can the next session continue without guessing

The recovery path was then made explicit:
1. narrow the issue to artifact parsing and artifact shape
2. repair the parser to read the intended sections
3. add the missing run-field entry needed for resumability
4. rerun `doctor-run`

After that, `doctor-run` passed and the run returned to a safely resumable state.

## Why This Counts As Failure-Recovery Evidence

This sequence supports a narrow claim:

`Quick Codex can turn a broken or incomplete run artifact into an explicit recovery problem with a concrete fix path and a pass/fail recovery check.`

More specifically:
- the awkward state was surfaced as explicit failures, not hidden
- the recovery target was concrete
- the final check confirmed the run was healthy again

## Evidence Sources

Local run artifacts:
- `.quick-codex-flow/quick-codex-painpoint-evolution.md`
- `.quick-codex-flow/quick-codex-benchmark-proof.md`

Relevant package sources:
- [bin/quick-codex.js](./bin/quick-codex.js)
- [qc-flow/references/run-file-template.md](./qc-flow/references/run-file-template.md)

## What This Proves

This proof shows one real failure-recovery pattern:
- artifact health broke
- the failure was made explicit
- the workflow repaired the state
- the recovery check passed

## What This Does Not Yet Prove

This proof does not yet prove:
- long-running verify stall handling in the wild
- approval-denied recovery
- blocked-step recovery across many repos

Those need more benchmark runs from [BENCHMARKS.md](./BENCHMARKS.md).
