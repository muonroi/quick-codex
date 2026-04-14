# Benchmark Proof — Verification Thrash

This document captures one concrete proof scenario from [BENCHMARKS.md](./BENCHMARKS.md).

It is intentionally narrow.
The goal is to show one real anti-thrash behavior from the `quick-codex` implementation sequence, not to claim full benchmark coverage.

## Scenario

Benchmark:
- `Verification Thrash`

Pain point:
- "The workflow keeps rerunning broad checks without narrowing the hypothesis."

Repo under test:
- `quick-codex`

Task under test:
- the package evolution work that added `status`, `resume`, `doctor-run`, `STATE.md`, and the first benchmark proof

## Observed Verify Sequence

During the package implementation pass, verification did not pass on the first try.
The sequence failed in specific, local ways:

1. `node bin/quick-codex.js doctor`
   - failed because `lint-skills.sh` treated `qc-lock/SKILL.md` as missing frontmatter due to CRLF-sensitive matching
2. `node quick-codex/bin/quick-codex.js status --dir /mnt/d/Personal/Core`
   - printed a malformed `Current phase / wave` because the parser picked up the wrong field
3. `node quick-codex/bin/quick-codex.js doctor-run --dir /mnt/d/Personal/Core`
   - failed because the run parser did not read `Execution mode`, `Burn Risk`, and `Approval Strategy` correctly from the artifact shape

These were not solved by rerunning the same broad verify blindly.
Each failure led to a narrower hypothesis and a smaller fix.

## What Changed Instead Of Thrashing

Fix 1:
- narrow the problem to line-ending sensitivity in `lint-skills.sh`
- make frontmatter checks CRLF-tolerant

Fix 2:
- narrow the problem to run-file field extraction in `bin/quick-codex.js`
- teach the parser to read heading-style sections and `Current Status` fields correctly

Fix 3:
- narrow the problem to the run artifact itself
- add the missing `Execution mode` entry to the active run digest so `doctor-run` could validate the artifact cleanly

After those targeted fixes:
- `doctor` passed
- `status` printed the expected gate, phase, wave, risks, next verify, and next command
- `doctor-run` passed

## Why This Counts As Anti-Thrash Evidence

This sequence supports a narrow claim:

`Quick Codex's execution discipline favors hypothesis-based, step-local verification instead of repeatedly rerunning broad checks without learning.`

More specifically:
- the verify path changed after each failure
- fixes were scoped to the failing surface instead of broadening the task
- the workflow stopped to repair artifact/state parsing rather than narrating around the failures

## Evidence Sources

Local implementation artifacts:
- `.quick-codex-flow/quick-codex-painpoint-evolution.md`
- `.quick-codex-lock/quick-codex-benchmark-thrash.md`

Relevant package files:
- [bin/quick-codex.js](./bin/quick-codex.js)
- [scripts/lint-skills.sh](./scripts/lint-skills.sh)

## What This Proves

This proof shows one real anti-thrash pattern:
- verification failed
- the workflow narrowed the hypothesis
- the next verify changed accordingly
- the package converged without broad speculative looping

## What This Does Not Yet Prove

This proof does not yet prove:
- a quantitative reduction in verify retries across many repos
- a controlled A/B against raw Codex on the same bug
- long-run burn-rate savings

Those need more benchmark runs from [BENCHMARKS.md](./BENCHMARKS.md).
