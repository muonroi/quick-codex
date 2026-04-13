# Benchmark Proof — Positioning Test

This document captures one concrete proof scenario from [BENCHMARKS.md](./BENCHMARKS.md).

It is intentionally narrow.
The goal is to show that the package docs now answer common user pain points directly, not only in workflow theory.

## Scenario

Benchmark:
- `Positioning Test`

Pain point:
- "I do not want to infer the right workflow from theory. I want the docs to answer my actual problem quickly."

Repo under test:
- `quick-codex`

## Questions And Current Answers

Question:
- What do I use if Codex keeps losing the thread?

Current answers:
- [README.md](./README.md)
- [TASK-SELECTION.md](./TASK-SELECTION.md)
- [EXAMPLES.md](./EXAMPLES.md)

Question:
- What do I use if I want a step-by-step fix with verification?

Current answers:
- [README.md](./README.md)
- [QUICKSTART.md](./QUICKSTART.md)
- [TASK-SELECTION.md](./TASK-SELECTION.md)

Question:
- What do I use if I am returning after two days?

Current answers:
- [QUICKSTART.md](./QUICKSTART.md)
- [TASK-SELECTION.md](./TASK-SELECTION.md)
- [EXAMPLES.md](./EXAMPLES.md)

Question:
- What do I run if I do not trust the current run artifact?

Current answers:
- [QUICKSTART.md](./QUICKSTART.md)
- [TASK-SELECTION.md](./TASK-SELECTION.md)
- [README.md](./README.md)

## Why This Counts As Positioning Evidence

This sequence supports a narrow claim:

`Quick Codex now documents its recovery and execution surfaces in user pain-point language, not only in internal workflow terms.`

More specifically:
- the docs mention real user problems directly
- the docs map those problems to `qc-flow`, `qc-lock`, `status`, `resume`, and `doctor-run`
- the package exposes the answer in multiple entry docs, not in one buried section

## Evidence Sources

Package docs:
- [README.md](./README.md)
- [QUICKSTART.md](./QUICKSTART.md)
- [TASK-SELECTION.md](./TASK-SELECTION.md)
- [EXAMPLES.md](./EXAMPLES.md)

## What This Proves

This proof shows one real positioning improvement:
- the package can now be understood through user-visible problems
- the likely next command is easier to find without reading the whole system description

## What This Does Not Yet Prove

This proof does not yet prove:
- actual user-conversion lift
- onboarding-time reduction from a measured study

Those need external user testing beyond [BENCHMARKS.md](./BENCHMARKS.md).
