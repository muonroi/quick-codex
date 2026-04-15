# Verified Plan Template

Use this once context is sufficient and before execution begins.

```markdown
## Verified Plan
Goal: <one sentence>
Feature / issue this roadmap closes: <one feature, issue, or scoped deliverable>
Requirements covered: <R1, R2>
Out of scope: <explicit exclusions>
Plan inputs / evidence:
- ...

Affected area coverage:
- ...

| Phase | Status | Purpose | Covers requirements | Depends on | Exit criteria | Verify |
|---|---|---|---|---|---|---|
| P1 | pending | ... | R1 | none | ... | ... |
| P2 | pending | ... | R2 | P1 | ... | ... |

## Waves
| Wave | Phase | Status | Change | Done when | Verify |
|---|---|---|---|---|---|
| W1 | P1 | pending | ... | ... | ... |
| W2 | P1 | pending | ... | ... | ... |
| W3 | P2 | pending | ... | ... | ... |

## Plan Check
Requirement trace:
- R1 -> P1, W1, W2
- R2 -> P2, W3

Affected-area trace:
- UI / flows -> ...
- API / contracts -> ...
- data / persistence -> ...
- config / CI / deploy -> ...
- tests / docs / observability / security -> ...

Risks:
- ...

Assumptions:
- ...

Verification of plan:
- Every phase maps to requirements: yes/no
- The roadmap closes one feature or issue cleanly: yes/no
- Affected area is explicit: yes/no
- Evidence basis is sufficient: yes/no
- Dependencies are clear: yes/no
- Verify path exists for each wave: yes/no
- Out of scope is explicit: yes/no
- Risky assumptions are called out: yes/no

Plan status:
- `verified`
- `revise`
```

Rules:
- do not start execution until `Plan status` is `verified`
- treat this table as the roadmap for one feature or issue, not as a loose task list
- every phase and wave must trace back to this roadmap until feature close is recorded
- if implementation changes dependencies or required outcomes, return here and relock
- only one wave should be `in_progress` during execution
