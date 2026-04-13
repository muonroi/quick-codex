# Benchmark Proof

This document captures one concrete proof scenario from [BENCHMARKS.md](./BENCHMARKS.md).

It is intentionally narrow.
The goal is not to prove every Quick Codex claim at once.
The goal is to show one community-relevant pain point with real local evidence.

## Scenario

Benchmark:
- `Resume After Interruption`

Pain point:
- "I came back later and do not trust the current chat state."

Repo under test:
- `/mnt/d/Personal/Core`

Task under test:
- the completed Quick Codex evolution run at `.quick-codex-flow/quick-codex-painpoint-evolution.md` in the local workspace

Supporting scaffold:
- `/tmp/quick-codex-init-check`

## Before

Before this package pass, the benchmark task itself recorded these limitations:
- the package CLI exposed only `install`, `doctor`, `init`, `upgrade`, and `uninstall`
- the package did not productize active-run recovery
- the package did not scaffold `STATE.md`

Evidence source:
- `.quick-codex-flow/quick-codex-painpoint-evolution.md` in the local workspace

Practical recovery path before:
1. find the right run file manually
2. open and read the run artifact directly
3. reconstruct the next prompt by hand

That path can work, but it depends on the operator remembering the artifact shape.

## After

After the package changes, the same workspace exposes a deterministic recovery surface:
- `quick-codex status`
- `quick-codex resume`
- `quick-codex doctor-run`
- `.quick-codex-flow/STATE.md`

Package sources:
- [bin/quick-codex.js](./bin/quick-codex.js)
- [templates/.quick-codex-flow/STATE.md](./templates/.quick-codex-flow/STATE.md)
- [qc-flow/SKILL.md](./qc-flow/SKILL.md)

Observed local results:
- `status` resolved the active run and printed the gate, phase, wave, risks, next verify, and next command
- `resume` printed a pasteable next prompt
- `doctor-run` validated that the run artifact was resumable
- `init` scaffolded `STATE.md` in a fresh project directory

Evidence sources:
- `.quick-codex-flow/quick-codex-painpoint-evolution.md` in the local workspace
- `.quick-codex-flow/STATE.md` in the local workspace

## Concrete Recovery Difference

Old recovery shape:
- artifact-first, manual, operator-dependent

New recovery shape:
1. run `quick-codex status`
2. run `quick-codex resume`
3. paste the returned prompt

This does not eliminate the run artifact.
It makes the artifact discoverable and usable without relying on chat memory or manual file-shape recall.

## What This Proves

This proof supports a narrow claim:

`Quick Codex now productizes resume reliability better than before for a real workspace and a real task.`

More specifically, it shows:
- active-run discovery is now explicit
- next-step routing can come from file state instead of chat memory
- a fresh project scaffold now includes state needed for deterministic resume

## What This Does Not Yet Prove

This proof does not yet prove:
- an 8 to 12 turn drift comparison against raw Codex
- quantitative token savings
- verification-thrash reduction across multiple repos

Those need additional benchmark runs from [BENCHMARKS.md](./BENCHMARKS.md).
