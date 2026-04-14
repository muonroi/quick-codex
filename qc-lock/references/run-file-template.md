# Persistent Run File Template

Use this file for any task that may outlive a single short turn.

Recommended path:

```text
.quick-codex-lock/<task-slug>.md
```

Naming:
- task slug: lowercase words separated by `-`
- relock versions: `v1`, `v2`, `v3`

Template:

```markdown
# Run: <task name>

## Requirement Baseline
Original goal:
- ...

Required outcomes:
- R1: ...
- R2: ...

Affected area:
- ...

Protected boundaries:
- ...

Constraints:
- ...

Out of scope:
- ...

Definition of done:
- ...

## Phase List
| Phase | Status | Purpose | Covers requirements | Covers affected area | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|---|
| P1 | done | ... | R1 | API contract | none | ... | ... |
| P2 | in_progress | ... | R2 | persistence + tests | P1 | ... | ... |
| P3 | pending | ... | R1,R2 | docs + cleanup | P2 | ... | ... |

## Preflight Summary
Upstream artifact:
- `qc-flow` run | other artifact | none

Evidence basis:
- ...

Preflight decision:
- ready-to-lock | keep-researching | hand-back-to-qc-flow

## Current Locked Plan
<paste the current locked plan block here>

## Phase Notes
### P1
Completed:
- ...

Verification:
- ...

Requirements still satisfied:
- R1

### P2
Current focus:
- ...

Open risks:
- ...

## Verification Ledger
- <timestamp> <command or method> -> <result>

## Blockers
- none

## Relock History
- v1: initial lock
- v2: relocked because ...
```

Rules:
- keep `Requirement Baseline` stable
- track requirement ids like `R1`, `R2` so later phases can reference them
- keep `Affected area` and `Protected boundaries` explicit when relocking
- after every phase, record `Requirements still satisfied`
- when resuming, read this file before doing anything else
- after each verified wave or phase, record any checkpoint commit before continuing
