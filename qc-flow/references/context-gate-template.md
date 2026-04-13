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

Open questions:
- Q1: ...
- Q2: ...

Context sufficiency check:
- Repo area known: yes/no
- Relevant files identifiable: yes/no
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
- keep the required outcomes stable
