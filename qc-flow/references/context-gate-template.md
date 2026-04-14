# Context Gate Template

Use this when clarifying the task and checking whether context is sufficient.

```markdown
## Clarify State
Goal:
- ...

Required outcomes:
- R1: ...
- R2: ...

Constraints:
- ...

Out of scope:
- ...

Known context:
- repo/module: ...
- likely files/search targets: ...
- technical constraints: ...

Affected area / blast radius:
- user-visible flows or UI: ...
- API / contract / integration points: ...
- data / schema / persistence: ...
- config / env / deploy / CI: ...
- tests / observability / docs / security: ...

User-confirmed assumptions:
- A1: ...

Open questions:
- Q1: ...
- Q2: ...

Context sufficiency check:
- Repo area known: yes/no
- Relevant files identifiable: yes/no
- Affected area explicit: yes/no
- Protected boundaries known: yes/no
- Constraints understood: yes/no
- Risks understood: yes/no
- Verify path known: yes/no

Decision:
- `clear`
- `research-needed`
- `clarify-needed`

Next action:
- ...
```

Rules:
- stay here until the decision is not ambiguous
- if one or more sufficiency items are `no`, do not plan yet
- if the affected area is vague, do not treat the task as clarified yet
- keep the required outcomes stable
