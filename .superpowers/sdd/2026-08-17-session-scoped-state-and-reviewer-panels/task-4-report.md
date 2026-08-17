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
