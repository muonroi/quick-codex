# Session-Scoped State and Reviewer Panels

## Goal

Allow multiple Codex sessions to operate in the same repository without
overwriting each other's Quick Codex runtime state, and require independent
reviewer panels at judgement-bearing verification gates.

## Requirements

- R1: Every mutable flow, lock, wrapper, roadmap, and backlog artifact belongs
  to exactly one Codex thread namespace.
- R2: The default namespace comes from a trusted Codex thread identity; no
  mtime-based transcript heuristic may select a write target.
- R3: Concurrent sessions may create identical task slugs and update state
  without cross-session reads or writes.
- R4: Existing flat artifacts remain readable. Migration is explicit,
  copy-only, idempotent, and never overwrites a destination.
- R5: `qc-flow` and `qc-lock` verification gates require independent
  role-based reviewer panels by default, without replacing deterministic
  build/test verification.
- R6: Existing command, host-API, explicit `--run`, and legacy-run behavior
  stay compatible where ownership is unambiguous.

## Storage Model

```text
.quick-codex-flow/
  wrapper-config.json                 # repository configuration (shared)
  sessions/
    <thread-id>/
      .session.json                   # canonical ID, source, owner nonce, parent
      STATE.md
      runs/<task>.md
      locks/<task>.md
      wrapper-state.json
      PROJECT-ROADMAP.md
      BACKLOG.md
```

`<thread-id>` is a validated, encoded Codex thread ID. All runtime paths are
derived from one immutable `SessionContext`; individual callers must not
reconstruct paths. Pointers inside `STATE.md` are session-root-relative
(`runs/<task>.md` and `locks/<task>.md`) rather than repo-relative.

`PROJECT-ROADMAP.md` and `BACKLOG.md` become session-local snapshots so they
cannot collide. A future `--all-sessions` view may aggregate them read-only;
it must not claim one session's board represents repository-global truth.

## Ownership and Identity Contract

Session selection follows this order:

1. An explicit `--run` determines the storage owner when it is inside a known
   session namespace or legacy layout.
2. An explicit `--session <id>` selects that namespace.
3. A trusted injected/runtime Codex thread identity selects its namespace.
4. Exactly one canonical namespace may be selected automatically.
5. Legacy flat state may be selected only when no session namespace exists or
   the caller explicitly asks for `--legacy`.
6. Otherwise commands fail with actionable `--session` or `--run` guidance.

`--run` and `--session` must agree. A new thread continuing work from another
session creates a non-destructive fork with parent provenance; it never moves
or silently shares the source namespace. Arbitrary external run paths remain
readable, but mutation needs an explicit derived owner and otherwise fails.

The former `findRecentCodexSession()` scan can remain a diagnostic hint only;
it must never choose a mutable namespace.

## Namespace Lifecycle

When a final identity is unavailable, allocate `pending-<randomUUID>` with
exclusive creation and an owner nonce in `.session.json`. Pass that same
`SessionContext` through every read and write from command entry.

- App-server: establish the thread and promote before `turn/start`.
- Exec: keep the provisional namespace for the complete child lifetime; only
  promote after child exit and final-ID extraction.
- Native TUI: retain the provisional context until an observed trusted ID can
  promote it; never infer a target from a recent transcript.

Promotion has explicit states:

- absent target: atomically rename within the sessions parent and refresh
  context;
- target with the same owner nonce: idempotent recovery;
- target with another owner: fail closed and preserve both directories;
- rename or ID failure: preserve a marked, recoverable provisional directory.

An app-server resume/compact fallback that creates a fresh thread forks into a
new provisional namespace before promotion. Promotion must be quiescent and
must re-read artifacts after completion. Session-relative pointers avoid
rewriting embedded path strings; display/resume commands include an explicit
session selector when needed.

## Compatibility and Migration

Flat `.quick-codex-flow/*.md`, `.quick-codex-lock/*.md`, root `STATE.md`, and
root wrapper state constitute the legacy layout. They are readable in labeled
compatibility mode but may not be mutated from a new session implicitly.

`quick-codex migrate-state --to-session <id> [--dry-run]` copies the legacy
state graph to a new namespace, preserves source bytes, writes a manifest with
source/destination/checksums, rewrites only copied pointers as required, and
validates the destination with status/resume/doctor. A target collision,
partial copy, or unresolved owner prevents success; rerunning a completed
migration is an idempotent no-op.

Repository `wrapper-config.json` remains shared. The host API accepts an
optional session context and exposes the central resolver, while preserving
unambiguous existing calls.

## Write Safety

Run and lock names use exclusive creation rather than existence checks.
Mutable JSON/Markdown state uses atomic temp-file-and-rename writes, with a
per-path in-process mutex plus cross-process protection. Reads/writes retry
boundedly for transient `EBUSY`/`EPERM`/mid-write parse errors. No operation
may merge namespace directories automatically.

Recovery claims use an ABA-safe quarantine protocol. A cleaner atomically
renames the observed canonical claim to a unique same-directory quarantine
path before inspecting or removing it. Any publisher that arrives afterward
creates a new canonical claim and cannot be removed by that cleaner. The
cleaner only deletes its quarantine path after validating that it is stale;
live claims are never reclaimed by age alone.

## Reviewer Panel Contract

Execution remains sequential. At every judgement-bearing plan-check,
wave/phase-close, and feature-close gate, newly created artifacts require a
reviewer panel with default `N=3` (minimum `2`, configurable explicitly):

1. correctness and invariant reviewer;
2. compatibility and blast-radius reviewer;
3. adversarial verification and test reviewer.

Each reviewer receives the same bounded owner-session artifact path and source
evidence, has a unique role/scope, cannot see peer conclusions, and is
read-only. The parent session is the only writer of the artifact. Deterministic
build/test results remain required evidence; reviewer opinion does not replace
them.

A panel passes only after all required distinct reviewers finish and every
blocking or partial verdict is resolved or explicitly waived by the parent.
There is no majority vote. The artifact stores reviewer ID, role, scope,
status, verdict, evidence reference, disposition, and an aggregate synthesis.
Status, resume, and doctor output expose incomplete panels. Existing
single-delegation artifacts parse as legacy panels and retain their current
completion semantics; multi-reviewer panels cannot be collapsed by the old
single-result command.

## Implementation Phases

| Phase | Outcome | Verification |
|---|---|---|
| P0 | Freeze legacy contracts and baseline tests | Flat paths, explicit `--run`, host API, init, and old doctors covered |
| P1 | `SessionContext`, validation, atomic IO, namespace lifecycle | Identity precedence, path containment, provisional/promote collision and recovery tests |
| P2 | Route wrapper, CLI, bootstrap, protocol, flow/lock and project writes through the context | Two concurrent sessions share no mutable files; adapters respect identity timing |
| P3 | Legacy migration and compatibility surface | Copy-only/idempotent migration; legacy reads; no ambiguous mutable fallback |
| P4 | Reviewer panel schema, CLI, skills, templates, and docs | Quorum/rejection/repair tests with deterministic fake reviewer results |
| P5 | End-to-end regressions and optional live smoke | Full suite, two-session process race, adapter fakes, and gated real-agent smoke |

## Test Matrix

- Two session IDs concurrently create the same flow and lock slug, update
  wrapper/project state, and run status/resume/doctor with no cross writes.
- Missing identity produces independent provisional namespaces; reverse-order
  promotions remain correct.
- Malformed or traversal IDs are rejected; recent same-CWD transcripts never
  pick a write namespace.
- `--run` from A cannot write ambient B; a fresh continuation leaves A intact.
- Promotion covers absent target, same-owner recovery, target collision,
  injected filesystem failures, and adapter-specific timing.
- Legacy reads work; migration preserves legacy bytes, refuses collisions, and
  is idempotent.
- Reviewer panels verify exactly N distinct roles, all-pass quorum, blockers,
  stale/duplicate results, and legacy one-reviewer parsing. Ordinary unit tests
  use fake results, not real spawned agents.

## Out of Scope

- Automatic reconciliation or merging of project boards between sessions.
- Selecting mutable state from transcript recency.
- Replacing deterministic tests/builds with LLM reviewer verdicts.
- Silent recovery that merges conflicting namespaces.
