# Session-Scoped State and Reviewer Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate all mutable Quick Codex runtime artifacts by Codex thread and add independent reviewer panels to verification gates.

**Architecture:** A shared `SessionContext` owns identity validation, session-relative paths, legacy compatibility, provisional namespaces, promotion, and safe writes. All CLI and wrapper paths receive this context instead of constructing root-level paths. Verification gates use persisted, role-distinct reviewer panels, while deterministic test/build evidence remains authoritative.

**Tech Stack:** Node.js 18+, ES modules, `node:test`, filesystem atomic rename, existing Quick Codex Markdown artifacts.

**Spec:** `docs/superpowers/specs/2026-08-17-session-scoped-state-and-reviewer-panels-design.md`

## Global Constraints

- Canonical runtime identity is a validated Codex thread ID; never choose a mutable namespace from transcript recency or mtime.
- All mutable session artifacts live under `.quick-codex-flow/sessions/<id>/`; only repository `wrapper-config.json` is shared.
- `--run` determines storage owner, `--run` and `--session` must agree, and ambiguous default selection fails closed.
- Provisional namespaces are exclusive, recoverable, and never merged; fresh-session continuation forks rather than moves state.
- Use atomic writes and exclusive creation, with same-process and cross-process protection for mutable state.
- Legacy state remains readable; migration is explicit, copy-only, checksum-recorded, collision-safe, and idempotent.
- New judgement-bearing gates require a default three-role, read-only reviewer panel. All required reviewers must clear blockers; no majority vote.
- Reviewer agents receive the parent owner-session artifact explicitly and never own or mutate the artifact themselves.
- Existing completed legacy artifacts and explicit legacy `--run` calls remain readable and doctor-compatible.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/wrapper/session-context.js` | Validate identity, derive owner paths, create/fork/promote namespaces, and resolve legacy/session storage ownership. |
| `lib/wrapper/atomic-fs.js` | Exclusive file creation, mutex/lock-backed atomic writes, bounded transient filesystem retry. |
| `lib/wrapper/run-file.js` | Parse session-relative pointers and resolve artifacts through `SessionContext`. |
| `lib/wrapper/state.js` | Read/write namespace-local wrapper state. |
| `lib/wrapper/protocol.js` | Create flow/lock artifacts within a context and render session-relative pointers. |
| `lib/wrapper/reviewer-panel.js` | Build role assignments, parse results, aggregate strict quorum verdicts. |
| `bin/quick-codex.js` | `--session`, migration, session-aware commands, reviewer-panel command handling and doctors. |
| `bin/quick-codex-wrap.js` plus wrapper adapters | Allocate/fork/promote contexts at adapter-appropriate lifecycle points. |
| `qc-flow/`, `qc-lock/`, templates, contracts and docs | Teach session-scoped paths and mandatory role-based verification. |
| `tests/session-*.test.js`, `tests/reviewer-panel.test.js` | Identity, isolation, promotion, migration and quorum proof. |

### Task 1: Session Context and Atomic Storage Foundation

**Files:**
- Create: `lib/wrapper/session-context.js`
- Create: `lib/wrapper/atomic-fs.js`
- Create: `tests/session-context.test.js`
- Modify: `lib/wrapper/index.js`

**Interfaces:**
- Produces `resolveSessionContext({ dir, run, sessionId, legacy, createProvisional, env })`, `createProvisionalContext`, `promoteSessionContext`, and `forkSessionContext`.
- Produces `writeFileAtomic`, `createFileExclusive`, and `withPathLock` for all later state writers.

- [ ] **Step 1: Write identity and path tests**

```js
test("two thread IDs derive disjoint mutable roots", () => {
  const a = resolveSessionContext({ dir, sessionId: "thread-a" });
  const b = resolveSessionContext({ dir, sessionId: "thread-b" });
  assert.notEqual(a.root, b.root);
  assert.match(a.statePath, /sessions\/thread-a\/STATE\.md$/);
});

test("an unsafe identity cannot escape sessions", () => {
  assert.throws(() => resolveSessionContext({ dir, sessionId: "../other" }));
});
```

- [ ] **Step 2: Run the focused tests and confirm the resolver is missing**

Run: `node --test tests/session-context.test.js`

Expected: FAIL because `session-context.js` does not yet export the resolver.

- [ ] **Step 3: Implement the immutable context and atomic helpers**

```js
export function resolveSessionContext({ dir, run = null, sessionId = null, legacy = false, createProvisional = false, env = process.env }) {
  // Return { kind, id, root, statePath, runsDir, locksDir, wrapperStatePath,
  // projectRoadmapPath, backlogPath, manifestPath, relativeRunPath }.
}

export function writeFileAtomic(filePath, content) {
  // Write a same-directory unique temp file, fsync when available, then rename.
}
```

Validate accepted IDs, record `{ id, kind, source, ownerNonce, parent }` in
`.session.json`, give explicit `--run` precedence, reject owner conflicts, and
make recent-session discovery unavailable to this resolver.

- [ ] **Step 4: Add promotion and transient-write failure tests**

```js
test("promotion refuses a final namespace owned by another nonce", () => {
  const pending = createProvisionalContext({ dir });
  createFinalContextForAnotherOwner(dir, "thread-a");
  assert.throws(() => promoteSessionContext({ context: pending, threadId: "thread-a" }));
  assert.equal(fs.existsSync(pending.root), true);
});
```

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/session-context.test.js`

Expected: PASS.

Commit:

```bash
git add lib/wrapper/session-context.js lib/wrapper/atomic-fs.js lib/wrapper/index.js tests/session-context.test.js
git commit -m "feat: add session-scoped storage context"
```

### Task 2: Context-Owned Flow, Lock, Wrapper and Bootstrap Artifacts

**Files:**
- Modify: `lib/wrapper/protocol.js`
- Modify: `lib/wrapper/run-file.js`
- Modify: `lib/wrapper/state.js`
- Modify: `lib/wrapper/bootstrap.js`
- Modify: `lib/wrapper/active-run.js`
- Modify: `tests/protocol-enforcement.test.js`
- Modify: `tests/test-helpers.js`

**Interfaces:**
- Consumes `SessionContext` from Task 1.
- Produces session-root-relative `Active run` / `Active lock` pointers and context-aware `readRunArtifact`, `readActiveRunArtifact`, and `loadWrapperState` APIs.

- [ ] **Step 1: Add a two-session same-slug protocol test**

```js
test("flow bootstrap keeps identical task slugs inside their owner contexts", () => {
  const a = createSessionContext(project.dir, "thread-a");
  const b = createSessionContext(project.dir, "thread-b");
  const first = enforceQcFlowProtocol({ dir: project.dir, context: a, task: "Plan storage" });
  const second = enforceQcFlowProtocol({ dir: project.dir, context: b, task: "Plan storage" });
  assert.notEqual(first.artifact.absoluteRunPath, second.artifact.absoluteRunPath);
});
```

- [ ] **Step 2: Run the focused protocol tests and confirm root-state assumptions fail**

Run: `node --test tests/protocol-enforcement.test.js`

Expected: FAIL until flow/lock creation and readers accept a context.

- [ ] **Step 3: Route all wrapper artifact I/O through context**

Replace root `STATE.md`, `.quick-codex-lock`, and `wrapper-state.json` path
construction with the context paths. Store `runs/<slug>.md` and
`locks/<slug>.md` in session `STATE.md`; retain repo-relative paths only for
display. Use `createFileExclusive` for slug creation and `writeFileAtomic` for
state/wrapper-state changes. Keep flat explicit runs readable as `kind: legacy`
and reject implicit legacy mutation from a session context.

- [ ] **Step 4: Separate shared scaffold from session initialization**

Make `init`/wrapper bootstrap create shared guidance/config without treating a
root legacy `STATE.md` as current-session initialization. A live wrapper launch
creates the provisional context; it does not recreate the project scaffold.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/protocol-enforcement.test.js tests/lock-continuity.test.js`

Expected: PASS with existing legacy fixture coverage preserved.

Commit:

```bash
git add lib/wrapper/protocol.js lib/wrapper/run-file.js lib/wrapper/state.js lib/wrapper/bootstrap.js lib/wrapper/active-run.js tests/protocol-enforcement.test.js tests/test-helpers.js tests/lock-continuity.test.js
git commit -m "feat: scope flow artifacts to Codex sessions"
```

### Task 3: Session-Aware CLI and Explicit Legacy Migration

**Files:**
- Modify: `bin/quick-codex.js`
- Create: `tests/session-concurrency.test.js`
- Modify: `tests/flow-continuity.test.js`
- Modify: `tests/lock-continuity.test.js`

**Interfaces:**
- Consumes `resolveSessionContext` and context-aware artifact readers.
- Produces `--session <id>`, `--legacy`, `migrate-state --to-session <id> [--dry-run]`, and session-aware status/resume/doctor/project commands.

- [ ] **Step 1: Add CLI resolution and migration tests**

```js
test("status refuses ambiguous session namespaces without --session or --run", () => {
  createSession(project.dir, "thread-a");
  createSession(project.dir, "thread-b");
  const result = runCli(project.dir, "status", "--dir", project.dir);
  assert.match(result.stderr, /--session|--run/);
});

test("migration copies flat state and leaves source bytes unchanged", () => {
  const before = fs.readFileSync(legacyStatePath);
  const result = runCli(project.dir, "migrate-state", "--to-session", "thread-a", "--dir", project.dir);
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(legacyStatePath), before);
});
```

- [ ] **Step 2: Run the new tests and confirm command parsing is absent**

Run: `node --test tests/session-concurrency.test.js tests/flow-continuity.test.js`

Expected: FAIL because `--session` and `migrate-state` do not exist.

- [ ] **Step 3: Add context selection to every CLI command**

Extend `parseArgs`, command dispatch, `resolveRunPath`, `stateFileFor`, project
status/sync, delegation, close/repair, resume, checkpoint, and doctors. A
canonical explicit run owns its companion writes. Reject mismatched `--run` and
`--session`; preserve absolute/flat explicit read behavior. Remove
`findRecentCodexSession` from all mutation selection paths.

- [ ] **Step 4: Implement copy-only migration**

Discover the complete legacy graph (flow state, active run/lock, project
files, wrapper state), copy into an absent target, write a manifest with
checksums and source paths, validate destination `status`, `resume`, and
`doctor`, then mark complete. On any failure retain legacy unchanged and leave
no authoritative partial target. A rerun reads the manifest and returns a
no-op success.

- [ ] **Step 5: Add a barrier-synchronized two-process race test and commit**

Run: `node --test tests/session-concurrency.test.js tests/flow-continuity.test.js tests/lock-continuity.test.js`

Expected: PASS; two processes must create matching slugs, alter wrapper/project
state, and leave byte-for-byte snapshots of the other namespace unchanged.

Commit:

```bash
git add bin/quick-codex.js tests/session-concurrency.test.js tests/flow-continuity.test.js tests/lock-continuity.test.js
git commit -m "feat: add session-aware CLI state migration"
```

### Task 4: Wrapper Adapter Lifecycle and Cross-Session Forking

**Files:**
- Modify: `bin/quick-codex-wrap.js`
- Modify: `lib/wrapper/codex-cli.js`
- Modify: `lib/wrapper/app-server-client.js`
- Modify: `lib/wrapper/native-session.js`
- Modify: `lib/wrapper/decision.js`
- Modify: `lib/wrapper/follow-loop.js`
- Create: `tests/wrapper-session-promotion.test.js`

**Interfaces:**
- Consumes provisional/final/fork context functions.
- Produces adapter result metadata containing the promoted owner context and persists state only into that owner.

- [ ] **Step 1: Add fake-adapter timing tests**

```js
test("exec promotes only after the child closes", async () => {
  const result = await runFakeExecWithSessionId("thread-a");
  assert.equal(result.events.indexOf("child-close") < result.events.indexOf("promote"), true);
});

test("app-server promotes before turn/start", async () => {
  const result = await runFakeAppServer("thread-a");
  assert.equal(result.events.indexOf("promote") < result.events.indexOf("turn/start"), true);
});
```

- [ ] **Step 2: Run the focused adapter tests and confirm lifecycle hooks are missing**

Run: `node --test tests/wrapper-session-promotion.test.js`

Expected: FAIL until wrapper context is created before the first active-run/state read.

- [ ] **Step 3: Thread immutable context through wrapper orchestration**

Allocate a provisional context at raw-task command entry. App-server promotes
before prompt construction/turn start; exec promotes after close then re-reads
the promoted artifact; Native waits for an observed trusted ID. A fresh thread
continuation forks selected source state and records `parent` instead of moving
it. A destination collision fails closed. Ensure `saveWrapperState` keys are
session-relative and use the final owner context.

- [ ] **Step 4: Test fallback and recovery paths**

Cover app-server compact/resume fallback to a fresh thread, exec non-zero exit
with final ID, missing final ID, reverse-order provisional completion, and a
crash/rename failure that leaves a recoverable pending namespace.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/wrapper-session-promotion.test.js tests/protocol-enforcement.test.js`

Expected: PASS.

Commit:

```bash
git add bin/quick-codex-wrap.js lib/wrapper/codex-cli.js lib/wrapper/app-server-client.js lib/wrapper/native-session.js lib/wrapper/decision.js lib/wrapper/follow-loop.js tests/wrapper-session-promotion.test.js
git commit -m "feat: promote wrapper state by Codex thread"
```

### Task 5: Reviewer Panel Data Model and Gate Enforcement

**Files:**
- Create: `lib/wrapper/reviewer-panel.js`
- Modify: `bin/quick-codex.js`
- Modify: `lib/wrapper/protocol.js`
- Modify: `lib/wrapper/run-file.js`
- Create: `tests/reviewer-panel.test.js`
- Modify: `tests/protocol-enforcement.test.js`
- Modify: `tests/flow-continuity.test.js`

**Interfaces:**
- Produces `buildReviewerAssignments({ gate, count })`, `aggregateReviewerResults(panel)`, and `reviewerGateViolation(metadata, gate)`.
- Persists a panel row `{ id, role, scope, status, verdict, evidenceRef, disposition }` plus aggregate synthesis.

- [ ] **Step 1: Add pure reviewer-panel tests**

```js
test("a three-role panel advances only when every reviewer passes", () => {
  const panel = buildReviewerAssignments({ gate: "plan-check", count: 3 });
  const verdict = aggregateReviewerResults(markAll(panel, "pass"));
  assert.deepEqual(verdict, { status: "pass", blockers: [] });
});

test("a blocker or duplicate role keeps the gate closed", () => {
  const panel = buildReviewerAssignments({ gate: "phase-close", count: 3 });
  assert.equal(aggregateReviewerResults(markOne(panel, "block")).status, "blocked");
});
```

- [ ] **Step 2: Run the panel tests and confirm the module is missing**

Run: `node --test tests/reviewer-panel.test.js`

Expected: FAIL because reviewer-panel functions do not exist.

- [ ] **Step 3: Implement strict panels without replacing deterministic proof**

Use default count three and roles `correctness-invariants`,
`compatibility-blast-radius`, and `adversarial-verification`. Serialize the
panel in new artifacts and make plan-check/wave-close/phase-close/feature-close
gate advancement require a completed strict aggregate alongside existing
verification commands. Parent-only artifact mutation is enforced in generated
reviewer prompts by including the explicit owner `--run`/`--session`.

- [ ] **Step 4: Preserve legacy delegation behavior**

Parse one existing delegation record as a legacy one-reviewer panel. Preserve
`delegate-plan-check`, `delegate-goal-audit`, and `complete-delegation` for
legacy runs; reject using a single completion to close an active multi-reviewer
panel. Add additive reviewer-specific CLI input and show panel state in
status/resume/doctor.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/reviewer-panel.test.js tests/protocol-enforcement.test.js tests/flow-continuity.test.js`

Expected: PASS.

Commit:

```bash
git add lib/wrapper/reviewer-panel.js lib/wrapper/protocol.js lib/wrapper/run-file.js bin/quick-codex.js tests/reviewer-panel.test.js tests/protocol-enforcement.test.js tests/flow-continuity.test.js
git commit -m "feat: require independent reviewer panels at gates"
```

### Task 6: Skill, Template, Contract and Public Documentation Alignment

**Files:**
- Modify: `qc-flow/SKILL.md`
- Modify: `qc-lock/SKILL.md`
- Modify: `qc-flow/references/run-file-template.md`
- Modify: `qc-flow/references/execution-wave-template.md`
- Modify: `qc-flow/references/phase-close-template.md`
- Modify: `qc-lock/references/run-file-template.md`
- Modify: `templates/.quick-codex-flow/README.md`
- Modify: `templates/.quick-codex-flow/STATE.md`
- Modify: `README.md`
- Modify: `QUICKSTART.md`
- Modify: `EXAMPLES.md`
- Modify: `CONTINUITY-CONTRACT.md`
- Modify: `SUBAGENTS-DESIGN.md`
- Modify: `tests/flow-continuity.test.js`

**Interfaces:**
- Consumes the final session path and reviewer-panel contracts from Tasks 1–5.
- Produces consistent installed guidance that keeps reviewer agents read-only and parent-owned.

- [ ] **Step 1: Add documentation assertions**

```js
test("scaffold guidance points to session namespaces and reviewer panels", () => {
  const result = runCli(project.dir, "init", "--dir", project.dir);
  assert.equal(result.status, 0);
  assert.match(readTemplate(project.dir, "README.md"), /sessions\//);
  assert.match(readSkill("qc-flow/SKILL.md"), /default three-role reviewer panel/);
});
```

- [ ] **Step 2: Run the documentation tests and confirm old flat guidance fails**

Run: `node --test tests/flow-continuity.test.js`

Expected: FAIL until templates and skills describe session roots and reviewer quorum.

- [ ] **Step 3: Update all runtime-writing instructions and contracts**

Replace flat run discovery and root `STATE.md` wording with resolver-first,
session-root-relative guidance. Supersede single-agent/no-multi-agent claims at
judgement gates with default N=3 independent read-only reviewer panels; retain
sequential implementation and deterministic verification requirements. Document
legacy migration, explicit selectors, shared configuration, session-local
boards, and optional read-only all-session aggregation.

- [ ] **Step 4: Run lint and focused docs tests**

Run: `npm run lint:package && node --test tests/flow-continuity.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add qc-flow qc-lock templates README.md QUICKSTART.md EXAMPLES.md CONTINUITY-CONTRACT.md SUBAGENTS-DESIGN.md tests/flow-continuity.test.js
git commit -m "docs: describe session-scoped reviewer workflow"
```

### Task 7: Integration Proof, Regression Review and Release Readiness

**Files:**
- Modify: `tests/test-helpers.js`
- Modify: `tests/session-concurrency.test.js`
- Modify: `tests/wrapper-session-promotion.test.js`
- Modify: `README.md` (only if proof commands need correction)

**Interfaces:**
- Consumes all completed session and reviewer-panel contracts.
- Produces a stable full-suite and optional real-agent smoke verification path.

- [ ] **Step 1: Add an end-to-end two-session test fixture**

```js
test("two concurrent sessions complete different reviewer panels without cross-state writes", async () => {
  const [a, b] = await Promise.all([
    runCliAsync(project.dir, ["auto", "--session", "thread-a", "--task", "plan A", "--dry-run"]),
    runCliAsync(project.dir, ["auto", "--session", "thread-b", "--task", "plan B", "--dry-run"])
  ]);
  assert.equal(a.status, 0);
  assert.equal(b.status, 0);
  assertNamespaceIsolation(project.dir, "thread-a", "thread-b");
});
```

- [ ] **Step 2: Run the integration suite and inspect any regression by hypothesis**

Run: `node --test tests/session-context.test.js tests/session-concurrency.test.js tests/wrapper-session-promotion.test.js tests/reviewer-panel.test.js`

Expected: PASS.

- [ ] **Step 3: Run package quality gates**

Run: `npm test && npm run lint:package && npm run doctor`

Expected: PASS with no warnings in touched code paths.

- [ ] **Step 4: Execute the optional live-agent smoke separately**

Run: documented opt-in command using three read-only reviewers against a fixture run.

Expected: panel records distinct roles and parent-only artifact writes. Do not
make CI depend on external agents.

- [ ] **Step 5: Commit and prepare final reviewer package**

```bash
git add tests README.md
git commit -m "test: prove session isolation and reviewer quorum"
```

## Plan Self-Review

- Spec coverage: R1/R2/R3 map to Tasks 1–4 and 7; R4 maps to Task 3; R5 maps to Task 5–7; R6 maps to Tasks 2–3 and 6.
- Protected boundaries: deterministic verification, explicit `--run`, legacy reads, shared config, no automatic merge, and parent-only artifact ownership are stated in Global Constraints and covered by task tests.
- Completeness scan: no unfinished markers or unspecified error-handling steps; each task names concrete files, APIs, tests, commands, and commit scope.
- Interface consistency: every consumer uses `SessionContext` from Task 1; reviewer panel APIs originate in Task 5 and are only consumed afterward.
