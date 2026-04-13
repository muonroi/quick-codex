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
