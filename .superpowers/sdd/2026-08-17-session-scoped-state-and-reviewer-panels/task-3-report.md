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
