---
name: "qc-flow"
description: "Clarify unresolved requirements or repo contracts, verify a small plan, then execute sequentially with one resumable run and executable evidence gates. Use when the affected area, protected boundary, evidence, or verification path is not yet explicit."
---

# Quick Codex Flow

Keep one run as the source of truth. Resolve the unknown that changes the next
safe action, detail only the active wave, execute, and record proof.

## Route and authority

Use `qc-flow` while requirements, contracts, ownership, affected area, or the
verification path remain unresolved. Use `qc-lock` only for one execution-ready
wave whose scope and evidence are explicit. Trivial edits need neither artifact.

A gray area blocks the work that depends on its answer. Record the dependency,
research repo facts directly, and ask the user only for missing intent, scope,
or authority. Continue independently authorized work with a clear verification
path. Do not implement the unresolved portion, silently assume its contract, or
convert it to a lock. Reuse decisions and authorization already given; checkpoints
do not create a new approval requirement.

Complete an action request through verification when authorized. `manual` means
the user requested checkpoints; `auto` means continue through clear, authorized
steps. Explicit user preferences take precedence. Stop only for a real dependency,
a scope change needing a decision, unavailable approval, or a user-requested pause.

## One current state

Create `.quick-codex-flow/sessions/<thread-id>/runs/<task-slug>.md` using
[the run template](references/run-file-template.md). Use a trusted Codex thread
ID or explicit session selector. Never combine mutable state across sessions.
CLI selectors are `--run`, `--session`, or explicit `--legacy` for flat artifacts.
Do not guess between multiple plausible active runs.

New runs use `Artifact profile: lean`:

- `Requirement Baseline`: goal, required outcomes, affected files, protected boundaries.
- `Current Status`: the only editable current gate, phase, wave, execution state,
  execution mode, blockers, next verification, and next command.
- `Evidence Basis`: exact files, contracts, revisions, decisions needed for this wave.
- `Verified Plan`: short milestone roadmap; detail only `Current Execution Wave`.
- `Verification Plan`: executable checks by behavior group and evidence kind.
- `Verification Ledger` and machine-written `Verification Receipt`: observed proof.
- `History`: superseded decisions or checkpoints, without competing current status.

Add a gray-area, decision, dependency, reviewer, or Experience section only when
it has real entries. Do not create empty governance or delegation registers.
`STATE.md` is a discovery pointer, never another status ledger. A native planner
may mirror the active work briefly; it cannot override the run.

Create `PROJECT-ROADMAP.md` and `BACKLOG.md` only for requested cross-run governance
or real deferred work. Reference the owning run instead of copying its wave status.
Use existing expanded runs without forced migration. Their generated digests and
handoffs remain compatible; when `Current Status` declares a field, it wins over
legacy mirrors. Do not keep an obsolete “not implemented” claim beside current proof.

## Clarify and research

Read the current run first on resume, then inspect only the evidence needed for
the next decision. Locate files with search; do not guess paths or reread unchanged
sections. Query Experience Engine before an unfamiliar or risky step when available,
then verify recalled guidance against the exact current code.

Record each unresolved question with its owner, dependent work, and resolution.
Ask concise, concrete questions only when research cannot supply the answer.
The user can choose freely; routine implementation choices stay with the agent.
Leave the dependent scope at `clarify` or `research` until the gray area is resolved.

Context is sufficient when the active wave has a concrete goal, affected files,
protected contracts, evidence, and an executable verification path. Stop research
there. Evidence from source, a build, unit tests, a package consumer, and a deployed
runtime are distinct; state the boundary of each claim.

## Plan only the next wave

Keep future milestones to purpose, dependency, and exit condition. Do not prewrite
future file lists, commands, or detailed wave artifacts. Reassess those when their
inputs exist. [The plan template](references/verified-plan-template.md) gives the
small shape; the run remains the owner of state.

Before execution, check that the active wave covers its requirements, preserves
protected boundaries, and can demonstrate each relevant behavior path. Record a
short plan-check conclusion with evidence. A paragraph saying “verified” is not
proof. For caches, enumerate applicable hit, miss, invalidation, mutable-option,
and error paths instead of treating one happy-path test as full coverage.

Delegation is optional unless the user or execution environment requires it.
When requested, serialize blocking checkpoints, give read-only reviewers the same
owner artifact and evidence, and merge their results before dependent work advances.
Existing required reviewer panels must pass their strict aggregate; executable
checks do not waive an assigned panel. Do not add reviewers to ordinary work by
habit. Use the delegation/review CLI commands only when needed.

## Execute and verify

Set the active wave to `in_progress`. Change only its declared scope, verify each
meaningful step, fix failures, then close the wave. Scope or contract changes reopen
the relevant research/plan gate before dependent edits. Independent authorized work
can continue. Update `Current Status` immediately after a meaningful transition.

Write `Verification Plan` as `Group | Kind | Command`. Every group is an observable
behavior or protected contract. Kinds are `preflight`, `build`, `test`, `consumer`,
and `deployed`. Record a row only when the command can actually test that claim.
Name excluded or unavailable evidence explicitly rather than assigning it a pass.

`quick-codex verify-wave --run <path>` runs preflights first, then shared builds,
then other checks, sequentially; identical commands run once per invocation.
Build a common dependency once for the same revision, configuration, framework,
and options; use `dotnet test --no-build` only for outputs actually built with
those inputs. Check infrastructure prerequisites before a large suite. Keep
concurrency bounded; do not launch overlapping builds against shared outputs.

Each command has a two-minute timeout and a 1 MiB output limit. Split a longer
suite into observable checks or run it directly with an explicit budget and retain
its evidence; the CLI gate still needs a bounded executable check of that result.
Never rerun a whole suite without a changed input, failure, or unresolved concern.

The receipt binds results to the verification plan, active wave, Git HEAD and
working source bytes, including dirty and untracked source. Workflow artifacts
are excluded. Keep generated build/test outputs ignored. Without Git, the receipt
binds the plan only and reports `unversioned`; it does not prove source freshness.

`quick-codex close-wave --run <path> [--phase-done]` requires every planned command
to pass against those inputs and any required reviewer panel to clear. A stale
receipt, missing group, failed preflight, or failed latest check blocks closure.
Old failed attempts stay in history; a successful current retry replaces their
blocking result. A legacy artifact without receipts still needs passing ledger
evidence for every active command.

Do not label a future wave complete or infer a deployed result from a local build.
Report errors, warnings, test results, and unavailable evidence only as observed.

## Resume and finish

On resume, read `Current Status`, active wave, proof, and live dependencies. Trust
the owner run over stale chat. Preserve only the current decision, invariants,
next verify, and exact continuation command across compaction. For legacy expanded
handoffs use `checkpoint-digest`; do not recreate their full narrative in chat.

At a checkpoint, update current state in place and move superseded facts to History.
At completion, verify required outcomes, mark the run `done`, and report the change,
verification, and material limits briefly. A planning-only or blocked run must
include an exact next command; authorized execution continues without asking the
user to paste it back at each checkpoint.

Experience Engine is optional. Fold applicable hints into evidence or invariants,
record disposition when it matters, and report feedback through
`node ~/.experience/exp-feedback.js followed|ignored|noise <id> <col> [reason]`.
Do not hardcode an endpoint or token. Preserve active warnings and their disposition
through compaction; empty Experience placeholders are unnecessary in lean runs.

## References

Read only the reference needed for the current action:

- [Run template](references/run-file-template.md): new lean run.
- [Verified plan](references/verified-plan-template.md): next-wave scope and checks.
- [Execution wave](references/execution-wave-template.md): active-wave details.
- [Context gate](references/context-gate-template.md), [research pack](references/research-pack-template.md): deeper investigation when needed.
- [Phase close](references/phase-close-template.md): expanded legacy handoff.
- [Project roadmap](references/project-roadmap-template.md), [backlog](references/backlog-template.md): cross-run governance when needed.
