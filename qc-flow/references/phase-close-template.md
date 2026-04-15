# Phase Close Template

Use this when a phase has finished execution and must be checked before the next phase begins.

```markdown
## Phase Close
Phase: P1
Result:
- <what the phase delivered>

Requirements covered:
- R1

Verification completed:
- <tests, readbacks, or checks that passed>

Requirements still satisfied:
- R1
- R2

Phase Relation:
- `same-phase`
- `dependent-next-phase`
- `independent-next-phase`
- `relock-before-next-phase`

Compaction action:
- `compact` when the next route stays in the same phase or carries a downstream-relevant subset
- `clear` when the next phase is independent and phase-local detail should be dropped
- `relock` when the next route needs a fresh plan or lock before continuation

Sealed decisions:
- <what is now fixed and should not be rediscovered>

Carry-forward invariants:
- <what the next phase or wave must keep true>

Expired context:
- <wave-local detail that no longer needs to be carried forward>

What to forget:
- <context that should be dropped during deliberate compaction>

What must remain loaded:
- <the minimum continuity payload required for the next route>

Carry-forward notes:
- <what the next phase must remember>

Open risks:
- <remaining risk or `none`>

Decision:
- `next-phase-ready`
- `needs-fix`
- `relock-required`

Why:
- <why this decision is correct>
```

Rules:
- create or update this artifact at the end of every completed phase
- if the decision is `needs-fix` or `relock-required`, do not start the next phase
- keep carry-forward notes short and actionable
- make `Phase Relation` explicit before deciding whether the next checkpoint should clear, compact, or relock
- keep `Compaction action` aligned with `Phase Relation`: `same-phase` -> `compact`, `dependent-next-phase` -> downstream-only `compact`, `independent-next-phase` -> `clear`, `relock-before-next-phase` -> `relock`
