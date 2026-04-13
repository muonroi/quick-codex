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
- if scope changes, return to the verified plan and relock before continuing
