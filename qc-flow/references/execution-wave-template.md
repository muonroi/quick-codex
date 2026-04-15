# Execution Wave Template

Use this after the verified plan is approved and a specific wave is active.

```markdown
## Execution Wave
Phase: P1
Wave: W1
Purpose: <what this wave changes>
Covers requirements: <R1, R2>
Depends on: <prior waves or `none`>

Files expected to change:
- ...

Done when:
- ...

Verify:
- ...

Invariant requirements:
- <what must remain true while implementing this wave>

Wave Handoff preparation:
- Candidate phase relation: `same-phase` | `dependent-next-phase` | `independent-next-phase` | `relock-before-next-phase`
- Candidate compaction action: `compact` | `clear` | `relock`
- Candidate sealed decisions: ...
- Candidate carry-forward invariants: ...
- Candidate expired context: ...
- Candidate what to forget: ...
- Candidate what must remain loaded: ...

Current status:
- `pending`
- `in_progress`
- `blocked`
- `done`

Current step notes:
- ...

Risks:
- ...

Experience inputs:
- <hook warning or `none`>

Verification result:
- pending
```

Rules:
- only one execution wave should be active at a time
- update this artifact when implementation or verification state changes
- keep `Wave Handoff preparation` current once the wave result becomes clear enough to checkpoint
- if the next route is already explicit and stays in the same phase, prepare a narrow next-wave pack instead of relying on the whole execution-wave narrative
- if scope changes, return to the verified plan and relock before continuing
