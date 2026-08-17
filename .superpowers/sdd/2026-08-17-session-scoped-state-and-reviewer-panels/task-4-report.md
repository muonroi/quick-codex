# Task 4 Report: Wrapper Adapter Session Promotion and Forking

## Result

Complete. Wrapper adapters now begin with an immutable provisional `SessionContext`, promote only from adapter-observed Codex thread IDs, rebind/reload against the final owner, and copy source-session state into a new destination without overwriting collisions.

## Implementation SHA

- `29b68a4206d036dfa1067d8c46aed64e63e64739` — `feat: promote wrapper state by Codex thread`

## Files Changed

- `bin/quick-codex-wrap.js`
- `lib/wrapper/active-run.js`
- `lib/wrapper/app-server-client.js`
- `lib/wrapper/codex-cli.js`
- `lib/wrapper/decision.js`
- `lib/wrapper/follow-loop.js`
- `lib/wrapper/index.js`
- `lib/wrapper/native-session.js`
- `lib/wrapper/session-context.js`
- `tests/wrapper-session-promotion.test.js`

## Lifecycle and Recovery Semantics

- Raw wrapper entry allocates one provisional context before reading mutable state and passes it through decision, follow, adapter, and state-write boundaries.
- Exec waits for child close, extracts the trusted final thread ID, promotes, and only then reloads final-owner artifacts. Missing IDs leave a recoverable provisional namespace.
- App-server establishes or resumes the thread and promotes before `turn/start`; after promotion its bridge is rebound to the final owner. Oversized resume/compact fallback forks the source snapshot into the fresh destination.
- Native task mode uses the observed `turn-settled` session ID as its trusted promotion signal and refuses task submission while ownership is still provisional.
- Forks copy the source namespace except its owner manifest, record parent and source snapshot metadata, are retryable after partial promotion, and fail closed on destination ownership collisions.
- Promotion is idempotent when rename succeeded but manifest refresh was interrupted. Recovery markers are retained on failure and cleared after successful ownership finalization.

## RED Evidence

The focused test was added first and failed because `finalizeAdapterSessionContext` did not exist. Subsequent single-contract RED runs demonstrated each missing boundary before its minimal fix:

- app-server reached `turn/start` without a final ID;
- recovery after rename-before-manifest-refresh failed;
- retry after source-copy plus rename failure hit destination `EEXIST`;
- a successful retry retained its recovery marker;
- the app-server bridge remained bound to the pending owner after promotion;
- artifact reload occurred before `turn/completed`;
- native task submission was possible while ownership remained provisional.

## GREEN Evidence

Focused verification:

```sh
node --test tests/wrapper-session-promotion.test.js tests/protocol-enforcement.test.js
```

Result: 26 passed, 0 failed.

Full verification:

```sh
node --check bin/quick-codex-wrap.js
node --check lib/wrapper/app-server-client.js
node --check lib/wrapper/codex-cli.js
node --check lib/wrapper/native-session.js
node --check lib/wrapper/session-context.js
npm run lint:package
npm test
git diff --check
```

Results:

- Syntax checks: passed.
- Package lint: `PASS: skills package shape looks valid`.
- Full suite: 98 passed, 0 failed (8.65 seconds).
- Diff whitespace check: passed.

## Boundaries and Environment Note

- Reviewer-panel behavior and documentation were not changed.
- No live external Codex smoke was run; adapter behavior is covered by deterministic fakes plus the full repository suite.
- The relocated worktree had no installed dependencies and `npm ci` could not rebuild `node-pty` because the host lacks `g++`. Tests temporarily used the already-built dependency tree from the main checkout via a symlink; that symlink was removed before staging and committing.

## Review Fix Round 1

### Implementation SHA

- `d68af68` — `fix: close wrapper session lifecycle gaps`

### Defects Closed

- A first native `--task` may now submit while its owner is provisional, but `NativeRemoteSession.task()` does not complete that first call until a trusted `turn-settled` ID has promoted the owner. The follow loop recognizes this first-turn wait and does not wait for the same settlement twice.
- A fresh app-server start derives the source from its incoming final context, creates its provisional child before `thread/start`, copies `STATE.md`, wrapper state, and run artifacts once, and records both `parent` and `forkSnapshot.sourceId` without mutating the source.
- A missing app-server thread ID marks the already-created provisional child recoverable and leaves the source final manifest untouched.
- `run --dry-run` resolves only already-materialized owners, does not allocate provisional or absent final namespaces, and does not create output directories.

### RED Evidence

Each regression failed independently before its production fix:

- Native first task: failed with `Native task submission is waiting for an observed trusted thread id.`; after allowing submission, the strengthened choreography assertion still failed because `ownerPromotedBy` was undefined when `task()` returned before settlement.
- Fresh app-server source fork: failed because `manifest.forkSnapshot` was absent.
- Missing app-server ID: failed because zero pending child namespaces existed and the final source was the attempted recovery target.
- Dry-run: failed because an empty project gained `.quick-codex-flow/sessions/pending-*/.session.json`.

### GREEN Evidence

Focused verification:

```sh
node --test tests/wrapper-session-promotion.test.js tests/protocol-enforcement.test.js
```

Result: 28 passed, 0 failed.

Full verification:

```sh
node --check bin/quick-codex-wrap.js
node --check lib/wrapper/app-server-client.js
node --check lib/wrapper/native-session.js
npm run lint:package
npm test
git diff --check
```

Results:

- Syntax checks: passed.
- Package lint: `PASS: skills package shape looks valid`.
- Full suite: 100 passed, 0 failed (8.71 seconds).
- Diff whitespace check: passed.

### Scope

- Changed only the wrapper run entry, native/app-server lifecycle code, and Task 4 regression tests.
- Reviewer panels, docs, migration behavior, and unrelated state contracts remain unchanged.

## Review Fix Round 2

### Implementation SHA

- `6a6d6058a16571ed76b79d1cac8b564e5014b865` — `fix: finalize session owners before wrapper work`

### Defects Closed

- The round-1 native submit-then-promote contract is superseded. `NativeRemoteSession.task()` now requires an observer-trusted session ID and successful promotion before `sendNativeTaskWithRetry` can write the task. Missing IDs mark the pending namespace recoverable and reject with zero controller writes; owner collisions also reject before submission while preserving both namespaces.
- Resume and compact oversized fallbacks invoke a pending-owner allocator before their fresh `thread/start` request. When that request returns no ID, the child—not the final source—is marked recoverable.
- Dry-run ownership is read-only across `run`, `auto --task`, `start`, and `continue`. Execution-context creation, output directory creation, and wrapper-state persistence are all skipped while source artifacts remain available for planning output.

### RED Evidence

- Native missing-ID regression rejected only after one controller write, proving Quick Codex work was submitted before ownership existed.
- Direct resume and compact fallback regressions each observed zero pending children at the moment `thread/start` was requested.
- The real CLI matrix showed `auto --task --dry-run` created a pending manifest, while `start --dry-run` and `continue --dry-run` created pending manifests plus wrapper state and output directories. `run --dry-run` was already clean from round 1.

The pre-observed native owner and native collision tests were added as contract characterizations: current promotion/collision primitives already passed them, while the missing-ID test killed the unsafe submission path.

### GREEN Evidence

Focused verification:

```sh
node --test tests/wrapper-session-promotion.test.js tests/protocol-enforcement.test.js
```

Result: 36 passed, 0 failed (including four dry-run command subtests).

Full verification:

```sh
node --check bin/quick-codex-wrap.js
node --check lib/wrapper/app-server-client.js
node --check lib/wrapper/native-session.js
npm run lint:package
npm test
git diff --check
```

Results:

- Syntax checks: passed.
- Package lint: `PASS: skills package shape looks valid`.
- Full suite: 108 passed, 0 failed (5.74 seconds).
- Diff whitespace check: passed.

### Scope

- Changed only wrapper dry-run execution routing, native pre-task ownership, app-server fallback ownership, and targeted Task 4 tests.
- Prior source-copy, promotion recovery, collision semantics, reviewer panels, docs, and migration behavior remain unchanged.

## Review Fix Round 3

### Implementation SHA

- `7e4cc68` — `fix: establish native owner before task submission`

### Architecture Rationale

- A native prompt-ready event proves only that the TUI can accept input; it does not prove which Codex thread owns wrapper state. The supported `/status` command is now an explicit identity handshake before a provisional native session may submit user work.
- The observer recognizes the `Session ID:` and `Chat ID:` labels emitted by current Codex TUI status output, while retaining the existing `codex resume <id>` parser for compatibility. A `/status` handshake accepts only an identity-bearing event emitted after that command was injected; it does not reuse a stale observer snapshot.
- Opportunistic promotion from arbitrary `turn-settled` events was removed. Promotion is performed only by the explicit ownership handshake, so neither an earlier task event nor `/clear` output can silently bind a pending namespace.
- `/clear` is a thread boundary: the session snapshots the old final owner, allocates and switches to a provisional child before injecting `/clear`, waits for the fresh prompt, then runs `/status` and promotes/forks the child before subsequent user work. This orders wrapper ownership independently from native rendering timing.
- Missing status identity marks the pending child `missing-final-id`; promotion collisions retain `promotion-failed`. Both paths stop before user-task submission and preserve source and occupied final namespaces.

### RED Evidence

The native-focused test run failed 5 regressions before implementation:

- a fresh native task rejected without attempting `/status`;
- missing-ID and collision paths made zero status-proof writes;
- `/clear` was injected while `ownerContext` still pointed at the old final namespace;
- `/clear` did not allocate/fork a child or reject a destination collision.

A strengthened `/clear` timing test then failed because `/status` was injected immediately after the new ID appeared, before the fresh prompt became ready. The guarded clear path now requires that follow-up prompt before identity proof.

### GREEN Evidence

Native lifecycle verification:

```sh
node --test --test-name-pattern='native' tests/wrapper-session-promotion.test.js
```

Result: 7 passed, 0 failed.

Focused Task 4 verification:

```sh
node --test tests/wrapper-session-promotion.test.js tests/protocol-enforcement.test.js
```

Result: 38 passed, 0 failed (including four dry-run command subtests).

Full verification:

```sh
node --check lib/wrapper/native-session.js
node --check tests/wrapper-session-promotion.test.js
npm run lint:package
npm test
git diff --check
```

Results:

- Syntax checks: passed.
- Package lint: `PASS: skills package shape looks valid`.
- Full suite: 110 passed, 0 failed (5.75 seconds).
- Diff whitespace check: passed.

### Scope

- Changed only the native wrapper lifecycle and targeted Task 4 promotion tests.
- Round-2 dry-run and app-server recovery behavior remained green.
- Reviewer panels, migration behavior, and unrelated documentation were not changed.

## Review Fix Round 4

### Implementation SHA

- `509b002` — `fix: verify native thread ownership before work`

### Mismatch and Transition Policy

- A final `SessionContext` is now a strict expected owner. Native command construction explicitly launches `codex ... resume <owner-id>`, but command selection is not accepted as proof: the first user task is blocked until a post-injection `/status` reports the same ID.
- If that status reports another ID, the session records a terminal ownership error and fails closed before user work or namespace mutation. This covers native continuation and an explicit `--session` context without silently rebinding or writing the selected source namespace.
- Fresh native work continues to use a provisional context. Its post-injection status proof promotes/forks only after the observed ID is complete, preserving the existing provisional and `/clear` lifecycle.
- `/resume` is a separate verified thread transition: it proves the current owner, executes the guarded resume, then issues a new `/status`. An explicit UUID must equal the observed target. Only then does the wrapper bind the existing target namespace (or materialize a new namespace for a previously unseen but observer-trusted resumed thread). A mismatch leaves both source and target bytes untouched and blocks later tasks.
- Standalone session-owned native launches cannot auto-submit a CLI prompt; callers must use `NativeRemoteSession` so status proof precedes task submission.

### Stream-Safe Status Proof

- Each guarded `/status` owns an empty 8 KiB raw output buffer created after its `slash-injected` event.
- Only `native-output` events newer than that boundary enter the buffer. The labelled `Session ID:` or `Chat ID:` plus UUID may span arbitrary PTY chunks, including a split UUID.
- Pre-injection observer text and partial stale identities are never joined into the command-scoped proof buffer.

### RED Evidence

The first native-focused run reproduced five independent gaps:

- an existing final owner submitted work without `/status`;
- a final-owner mismatch submitted work instead of failing closed;
- a split `Session ID:` and UUID timed out;
- `/resume` neither verified nor rebound the target owner;
- a final-owner native command did not include `resume <id>`.

A self-review regression then proved that standalone final-owner launch still allowed a prompt to be submitted before status proof; that test failed with `Missing expected rejection` before the launch guard was added.

### GREEN Evidence

Focused Task 4 verification:

```sh
node --test tests/wrapper-session-promotion.test.js tests/protocol-enforcement.test.js
```

Result: 45 passed, 0 failed.

Full verification:

```sh
node --check lib/wrapper/native-session.js
node --check lib/wrapper/session-context.js
node --check tests/wrapper-session-promotion.test.js
npm run lint:package
npm test
git diff --check
```

Results:

- Syntax checks: passed.
- Package lint: `PASS: skills package shape looks valid`.
- Full suite: 117 passed, 0 failed (5.72 seconds).
- Diff whitespace check: passed.
- The generated final-owner command shape was also accepted by the installed Codex CLI parser via `codex ... resume <id> --help`.

### Scope

- Changed only native lifecycle/status parsing, one session-context resolver for observer-trusted resume targets, and targeted Task 4 regression tests.
- Reviewer panels, skill docs, CLI migration, app-server behavior, and Task 5 onward were not changed.

## Review Fix Round 5

### Implementation SHA

- `3caa4b1` — `fix: harden native status ownership proof`

### Adjudication

- Both remaining findings reproduced against `42315c3` and were valid.
- A post-injection `turn-settled` event carrying `sessionId` could bypass the command-scoped status buffer and promote a stale owner before the real `/status` response arrived.
- A labelled status identity completed proof immediately, so `sendNativeTaskWithRetry()` could reuse the stable prompt from before `/status` and submit user work before the status view restored a new prompt.

### Defects Closed

- Guarded `/status` no longer admits raw `turn-settled` events into its settlement predicate. Its identity is derived only from accumulated `native-output` after the `slash-injected` boundary and only from an explicit `Session ID:` or `Chat ID:` label.
- Label parsing records an intermediate identity boundary instead of completing proof. The handshake settles only on a `prompt-ready` event whose event index is strictly newer than the identity-bearing output, preventing the next task from reusing a pre-status prompt.
- Other guarded slash commands retain their existing `turn-settled` behavior; Task 5+ and non-native adapters are unchanged.

### RED Evidence

Targeted command:

```sh
node --test --test-name-pattern='stale post-injection turn-settled|prompt newer than its identity' tests/wrapper-session-promotion.test.js
```

Result before the production change: 0 passed, 2 failed.

- The stale-event regression promoted `25252525-…` instead of the labelled status owner `26262626-…`.
- The prompt-boundary regression observed `identity, task, fresh-prompt` instead of the required `identity, fresh-prompt, task` order.

### GREEN Evidence

- Exact regressions: 2 passed, 0 failed.
- Native lifecycle subset: 16 passed, 0 failed.
- Focused Task 4/protocol suite: 47 passed, 0 failed.
- Full suite: 119 passed, 0 failed (5.76 seconds).
- `node --check` for the implementation and test file, package lint, and `git diff --check`: passed.

### Scope

- Changed only `lib/wrapper/native-session.js`, `tests/wrapper-session-promotion.test.js`, and this Task 4 report.
- Existing final-owner mismatch, collision recovery, `/clear`, `/resume`, app-server, dry-run, migration, and reviewer-panel behavior remain outside this fix.
