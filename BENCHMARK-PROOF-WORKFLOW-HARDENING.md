# Benchmark Proof — Workflow Hardening

This document captures one concrete proof scenario from [BENCHMARKS.md](./BENCHMARKS.md).

It is intentionally narrow.
The goal is to show that the updated `qc-flow` and `qc-lock` rules now defend two specific failure modes more explicitly than before:
- planning without a full affected-area discussion
- locking execution without enough research or evidence

## Scenario

Benchmark:
- `Workflow Hardening`

Pain point:
- "The workflow sounds disciplined, but it still lets the agent skip affected-area discussion or plan from thin evidence."

Repo under test:
- `quick-codex`

Task under test:
- updating the package workflow itself to require:
  - affected-area and blast-radius discussion in `qc-flow`
  - evidence-based planning in `qc-flow`
  - `qc-lock` preflight when upstream planning is missing or weak

## Before

Before this hardening pass:
- `qc-flow` already had clarify and research language, but it did not force the agent to spell out the full affected area
- `qc-flow` could still plan as soon as context "felt sufficient", without an explicit evidence basis or research-skip rationale
- `qc-lock` assumed the front-half was already done and did not require a preflight for standalone use
- public docs and scaffold templates still described the older, softer workflow

Practical risk before:
1. a medium task could skip full blast-radius discussion
2. the plan could be written from intuition rather than evidence
3. `qc-lock` could lock a narrow plan without proving the scope was truly narrow

## After

After the hardening pass:
- `qc-flow` now names `surface the full affected area before planning` and `require evidence before planning, not gut feel`
- `qc-flow` adds a dedicated `Affected-area and blast-radius discussion` gate before context sufficiency and research
- `qc-flow` planning now requires either:
  - a current research artifact with concrete evidence, or
  - an explicit research-skip rationale
- `qc-lock` now adds a required preflight when no verified upstream plan exists
- public docs and scaffold templates were updated to match the new workflow shape

Relevant sources:
- [qc-flow/SKILL.md](./qc-flow/SKILL.md)
- [qc-lock/SKILL.md](./qc-lock/SKILL.md)
- [README.md](./README.md)
- [QUICKSTART.md](./QUICKSTART.md)
- [templates/.quick-codex-flow/sample-run.md](./templates/.quick-codex-flow/sample-run.md)

## Real Task Evidence

This was not validated by text review alone.
The workflow update itself was run as a real local task with persistent artifacts:
- `.quick-codex-flow/public-docs-hardening-e2e.md`
- `.quick-codex-lock/public-docs-hardening-e2e.md`
- `.quick-codex-flow/STATE.md`

Observed validation results:
- `bash scripts/lint-skills.sh` passed
- `node bin/quick-codex.js install --target /tmp/quick-codex-e2e-install --copy` passed
- `node bin/quick-codex.js doctor --target /tmp/quick-codex-e2e-install` passed
- `node bin/quick-codex.js status --dir /mnt/d/Personal/Core/quick-codex` resolved the active run correctly during execution
- `node bin/quick-codex.js resume --dir /mnt/d/Personal/Core/quick-codex` returned the recorded next command
- `node bin/quick-codex.js checkpoint-digest --dir /mnt/d/Personal/Core/quick-codex` matched the compact-safe handoff
- `node bin/quick-codex.js doctor-run --dir /mnt/d/Personal/Core/quick-codex` passed

## Why This Counts As Evidence

This sequence supports a narrow claim:

`Quick Codex now defends its front-half workflow more explicitly, both in the skill rules and in the user-visible package surface.`

More specifically:
- affected area is now a first-class planning input instead of an implied one
- planning now demands evidence or an explicit skip rationale
- `qc-lock` no longer assumes the front-half is complete without proving it
- the package docs and scaffold output now teach the same rules the skill enforces
- the workflow change itself was exercised through a real task with recoverable artifacts

## What This Proves

This proof shows one real hardening improvement:
- the workflow is stricter about blast radius before planning
- the workflow is stricter about evidence before planning
- the execution skill is stricter about preflight before lock
- the package can validate those changes with a real local task rather than doc-only inspection

## What This Does Not Yet Prove

This proof does not yet prove:
- that every future Codex run will obey the stronger gates perfectly
- a measured reduction in bad plans across many repos
- an A/B comparison against the previous workflow on the same external task

Those need additional benchmark runs from [BENCHMARKS.md](./BENCHMARKS.md).
