# Task 3 Report: Session-Aware CLI and Explicit Legacy Migration

## Status

Complete. The workflow CLI now resolves one `SessionContext` at command entry, supports `--session <id>` and `--legacy`, fails closed for ambiguous or unresolved namespaces, binds companion writes to explicit run ownership, and provides staged copy-only legacy migration.

## Implementation SHA

- `002aa446299cabd03fdd96ca787b5c25082eac41` — `feat: add session-aware CLI state migration`

## Files Changed

- `bin/quick-codex.js`
  - parses `--session`, `--legacy`, `--to-session`, and `--dry-run`;
  - resolves workflow commands through the Task 1 `resolveSessionContext` API;
  - selects an already-materialized trusted namespace, exactly one canonical namespace, or explicit legacy state without using transcript recency;
  - rejects ambiguous/malformed ownership, mismatched selectors, external mutation, and cross-session state-pointer escapes;
  - routes state, run/lock, roadmap, backlog, delegation, repair, status/resume, and doctor paths through the selected context;
  - implements hidden-stage migration, pointer rewriting, checksum manifest generation, destination status/resume/doctor validation, absent-target publication, collision refusal, and completed-manifest no-op reruns.
- `tests/session-concurrency.test.js`
  - covers explicit/default/legacy selectors, ambiguity and malformed ownership, explicit run ownership, session-relative and absolute reads, pointer containment, migration dry-run/copy-only/collision/idempotency, and a barrier-synchronized two-process isolation race.
- `tests/flow-continuity.test.js`
  - proves session-owned flow mutations keep project companion files under the selected owner.
- `tests/lock-continuity.test.js`
  - proves session-aware doctor resolution follows the selected namespace's active lock.

## RED Evidence

Initial command:

```sh
node --test tests/session-concurrency.test.js tests/flow-continuity.test.js tests/lock-continuity.test.js
```

Result before production changes: 48 tests ran, 40 passed, and 8 failed for the intended missing behavior: unknown `--session`, `--legacy`, and `--to-session`, plus absent ambiguity guidance.

Additional focused RED regressions found during review:

- `--session thread-a --run runs/sample.md` failed because the Task 1 resolver saw the session-relative pointer as an unknown project path.
- A session `STATE.md` absolute pointer into another session succeeded and mutated the foreign run instead of failing closed.
- A malformed session owner manifest was ignored and default selection mutated legacy state.

Each regression was observed failing for that specific missing contract before its minimal fix.

## GREEN Evidence

Focused command:

```sh
node --test tests/session-concurrency.test.js tests/flow-continuity.test.js tests/lock-continuity.test.js
```

Result: 51 passed, 0 failed.

Full verification:

```sh
npm test
```

Result: 79 passed, 0 failed.

Additional verification:

- `npm run lint:package` — passed (`PASS: skills package shape looks valid`).
- `node --check bin/quick-codex.js` — passed.
- `git diff --check` — passed.

## Migration Semantics Implemented

- Legacy source files are read and checksummed but never modified or removed.
- Flat flow artifacts copy to `runs/`, flat lock artifacts copy to `locks/`, and state/project/wrapper files copy to their context-owned paths.
- Only copied pointer text is rewritten from `.quick-codex-flow/*.md` / `.quick-codex-lock/*.md` to `runs/*.md` / `locks/*.md`.
- A hidden `.migrate-*` staging directory is not a canonical namespace and is removed on validation failure.
- The target is published only after destination `status`, `resume`, `doctor-run`, and (when present) `doctor-project` validation succeeds.
- Existing targets are never overwritten. A completed `.migration.json` returns no-op success on rerun.

## Concerns / Boundaries

- Wrapper adapter context establishment, provisional promotion timing, and lifecycle integration remain Task 4 work and were not implemented here.
- Reviewer panel schema and gates remain Task 5 work and were not implemented here.
- `findRecentCodexSession()` remains only in the Experience Engine diagnostic request payload; it is not used by CLI namespace or mutation selection.
- Trusted environment identity is auto-selected only when its canonical namespace is already materialized. Explicit `--session` is the CLI path that may create a new canonical namespace; this prevents ordinary legacy commands from silently creating an unrelated empty namespace from inherited desktop environment variables.
- Per the no-subagent instruction, review was a local scoped diff/contract review plus deterministic focused and full verification.

## Review Fix Round 1

### Implementation SHA

- `bb374a2` — `fix: preserve CLI session ownership`

### Blocking issues closed

- An unknown trusted ambient `CODEX_THREAD_ID` now fails closed before the sole-canonical/default fallback. It cannot select or mutate an unrelated namespace; the error directs the caller to materialize the trusted owner with `--session <id>` or explicitly select `--run` / `--legacy`.
- Session delegation output now includes `--session <owner>` whenever its `--run` value is session-relative. The regression executes the exact printed shell command through a local CLI shim and proves completion succeeds against the original owner.
- CLI test helpers now remove inherited Codex identity variables by default and inject them only when a test explicitly requests them, so legacy/default selector tests are deterministic inside a live Codex session.

### RED evidence

Command:

```sh
node --test --test-name-pattern="unknown trusted ambient identity|owner-bearing completion command" tests/session-concurrency.test.js tests/flow-continuity.test.js
```

Result before production fixes: 2 tests ran and both failed for the reviewed reasons:

- ambient `thread-b` returned success and mutated sole namespace `thread-a`;
- the emitted completion command contained `--run runs/sample.md` but no `--session thread-flow`.

### GREEN evidence

- Each blocker-specific focused test passed independently after its minimal production change.
- Task 3 focused suite: 53 passed, 0 failed.
- Full `npm test`: 81 passed, 0 failed.
- `npm run lint:package`: passed.
- `node --check bin/quick-codex.js`: passed.
- `git diff --check`: passed.

### Remaining boundaries

- No Task 4 adapter lifecycle or Task 5 reviewer-panel behavior changed.

## Review Fix Round 2

### Implementation SHA

- `9cbf8df708dfc150054a2dadfe02df5a4702a49c` — `fix: normalize trusted CLI session identity`

### Critical issue closed

- Trusted ambient identity selection now trims both environment values, ignores empty strings, and selects the first non-empty value in precedence order: `CODEX_THREAD_ID`, then `CODEX_SESSION_ID`.
- With `CODEX_THREAD_ID=""`, `CODEX_SESSION_ID="thread-b"`, and only `thread-a` materialized, `capture-hooks` fails closed for `thread-b` and leaves `thread-a` byte-unchanged instead of falling through to the sole unrelated namespace.

### RED evidence

Command:

```sh
node --test --test-name-pattern="empty primary trusted identity" tests/session-concurrency.test.js
```

Result before the production fix: the regression failed because `capture-hooks` returned status 0, demonstrating that the empty primary identity masked the non-empty fallback identity and allowed sole-namespace fallback.

### GREEN evidence

- Combined critical regressions (`empty primary trusted identity|unknown trusted ambient identity|owner-bearing completion command`): 3 passed, 0 failed.
- Task 3 focused suite: 54 passed, 0 failed.
- Full `npm test`: 82 passed, 0 failed.
- `npm run lint:package`: passed.
- `node --check bin/quick-codex.js`: passed.
- `git diff --check`: passed.

### Files changed

- `bin/quick-codex.js`
- `tests/session-concurrency.test.js`

### Remaining boundaries

- No Task 4 adapter lifecycle or Task 5 reviewer-panel behavior changed.

## Review Fix Round 3

### Implementation SHA

- `78a0def5cce869293160e6d017b1a9a3d343299c` — `fix: bind normalized trusted session identity`

### Critical issue closed

- After CLI precedence selects and normalizes a trusted identity, the selected value is now passed to `resolveSessionContext` as an explicit `sessionId` with the inspected owner nonce. The lower layer no longer reinterprets the unnormalized process environment for this path.
- With an existing `thread-b` namespace, `CODEX_THREAD_ID=""`, and `CODEX_SESSION_ID="thread-b"`, `status` now selects `thread-b` successfully.
- The corresponding unknown-target case remains fail-closed and cannot fall through to a sole unrelated namespace.

### RED evidence

Command:

```sh
node --test --test-name-pattern="empty primary trusted identity selects an existing fallback namespace" tests/session-concurrency.test.js
```

Result before the production fix: the regression failed with status 1 and `No session identity is available`, proving the normalized identity was lost at the resolver boundary.

### GREEN evidence

- Existing-target, unknown-target, and prior unknown-ambient regressions: 3 passed, 0 failed.
- Task 3 focused suite: 55 passed, 0 failed.
- Full `npm test`: 83 passed, 0 failed.
- `npm run lint:package`: passed.
- `node --check bin/quick-codex.js`: passed.
- `git diff --check`: passed.

### Files changed

- `bin/quick-codex.js`
- `tests/session-concurrency.test.js`

### Remaining boundaries

- No Task 4 adapter lifecycle or Task 5 reviewer-panel behavior changed.
