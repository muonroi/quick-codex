# Locked Plan Template

Use this format when the skill locks a plan.

```markdown
## Locked Plan
Goal: <one sentence>
Current gate: execute
Execution mode: <manual | auto when provided by upstream handoff>
Phase: <phase id>
Phase purpose: <why this phase exists>
Covers requirements: <R1, R2>
Affected area: <which surfaces this lock may touch>
Protected boundaries: <what must not regress while changing this scope>
Scope: <what this run is allowed to change>
Out of scope: <explicit exclusions>
Evidence basis: <upstream plan, repo evidence, or preflight findings>
Lock rule: No scope expansion without relock.
Status: active

| Step | Status | Change | Done when | Verify |
|---|---|---|---|---|
| S1 | pending | ... | ... | ... |
| S2 | pending | ... | ... | ... |
| S3 | pending | ... | ... | ... |

Current step: S1
Current verify:
- <smallest reliable verify for the current step>

Recommended next command:
- <exact next locked step or relock command>

Invariant requirements:
- <required outcomes that must still hold after this phase>

Invariant affected area:
- <surfaces that remain in scope>

Blockers:
- <`none` or the current blocker>

Risks:
- <current technical risk>

Experience inputs:
- <active warning, constraint, or `none`>

Verification evidence:
- <proof that justifies the current step statuses or `none yet`>

Requirements still satisfied:
- <R1, R2>

Assumptions:
- <assumption that could block execution>
```

Status rules:
- `pending` — not started
- `in_progress` — active step
- `done` — step completed and verification passed
- `blocked` — cannot proceed without clarification or relock

Relock rules:
- relock when scope changes materially
- relock when a new required step appears
- relock when the locked verify path is no longer valid

Compact example:

```markdown
## Locked Plan
Goal: Add a retry guard to the API client without changing public behavior.
Current gate: execute
Execution mode: manual
Phase: P2
Phase purpose: Add the implementation change after the retry path is understood.
Covers requirements: R1
Affected area: API client retry path, targeted retry tests
Protected boundaries: public client API, abort handling, timeout semantics
Scope: `src/client.ts`, related tests
Out of scope: transport refactors, logging redesign
Evidence basis: verified `qc-flow` run plus retry-path read-through
Lock rule: No scope expansion without relock.
Status: active

| Step | Status | Change | Done when | Verify |
|---|---|---|---|---|
| S1 | done | Inspect retry flow and failing path | retry entry point identified | targeted read-through |
| S2 | in_progress | Add retry guard in client | guard prevents duplicate retry scheduling | `npm test -- client.retry` |
| S3 | pending | Clean up edge-case handling | abort and timeout cases still pass | `npm test -- client.retry` |

Current step: S2
Current verify:
- `npm test -- client.retry`

Recommended next command:
- Continue S2 until `npm test -- client.retry` passes, then mark S2 `done` and move to S3.

Invariant requirements:
- R1: Public retry behavior stays unchanged except for the duplicate scheduling bug.

Invariant affected area:
- Only retry scheduling and its targeted tests are in scope.

Blockers:
- none

Risks:
- Guard may suppress the first valid retry.

Experience inputs:
- Why: Last time similar retry state leaked across requests.

Verification evidence:
- S1 read-through identified the retry entry point and confirmed the duplicate scheduling path.

Requirements still satisfied:
- R1

Assumptions:
- Existing tests cover timeout and abort behavior.
```
