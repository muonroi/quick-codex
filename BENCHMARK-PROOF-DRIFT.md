# Benchmark Proof — Multi-turn Drift

This document captures one concrete proof scenario from [BENCHMARKS.md](./BENCHMARKS.md).

It is intentionally narrow.
The goal is to show one real anti-drift behavior from the `quick-codex` workflow, not to claim a measured 12-turn study.

## Scenario

Benchmark:
- `Multi-turn Drift`

Pain point:
- "A medium task loses its shape after a few turns, and the next step becomes fuzzy."

Repo under test:
- `quick-codex`

Task under test:
- the package evolution run and its follow-up benchmark runs in the same workspace

## Observed Drift-Resistance Pattern

The main implementation run ended with an explicit next command instead of a vague summary:
- run benchmark scenarios from `quick-codex/BENCHMARKS.md`

That handoff was then turned into follow-up runs with their own explicit goals:
- resume proof
- verification-thrash proof
- architecture-routing research

Across these follow-up tasks, the workflow kept explicit file-based state:
- `Current gate`
- `Execution mode`
- `Current phase / wave`
- `Remaining blockers`
- `Next verify`
- `Recommended next command`

This means continuation did not depend on reconstructing intent from chat memory alone.

## Why This Counts As Anti-Drift Evidence

This sequence supports a narrow claim:

`Quick Codex externalizes enough state that follow-up work can continue from artifacts instead of rebuilding the task from chat history.`

More specifically:
- each run ended with an explicit continuation surface
- the active state lived in run files and `STATE.md`
- the next benchmark tasks were selected from those artifacts, not inferred from a fuzzy transcript

## Evidence Sources

Local run artifacts:
- `.quick-codex-flow/quick-codex-painpoint-evolution.md`
- `.quick-codex-flow/quick-codex-benchmark-proof.md`
- `.quick-codex-lock/quick-codex-benchmark-thrash.md`
- `.quick-codex-flow/experience-engine-codex-router.md`

Relevant package sources:
- [qc-flow/SKILL.md](./qc-flow/SKILL.md)
- [templates/.quick-codex-flow/STATE.md](./templates/.quick-codex-flow/STATE.md)
- [bin/quick-codex.js](./bin/quick-codex.js)

## What This Proves

This proof shows one real anti-drift pattern:
- a non-trivial task ended with a concrete next command
- subsequent tasks were resumed or selected from artifact state
- the workflow kept gate and next-step clarity across multiple follow-up runs

## What This Does Not Yet Prove

This proof does not yet prove:
- a controlled 8 to 12 turn A/B against raw Codex
- a quantitative drift-rate reduction

Those need a dedicated benchmark run from [BENCHMARKS.md](./BENCHMARKS.md).
