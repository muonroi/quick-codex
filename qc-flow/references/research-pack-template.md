# Research Pack Template

Use this when Gate 3 is active and context is not yet sufficient.

```markdown
## Research Pack
Goal:
- <what the research is trying to learn>

Missing context being filled:
- ...

Affected area being validated:
- ...

Research questions:
- Q1: ...
- Q2: ...

Evidence:
- <repo evidence, docs, commands, findings>

Answered questions:
- Q1 -> ...

Unresolved questions:
- Q2 -> ...

Evidence basis for planning:
- repo evidence:
- docs or external evidence:
- explicit research-skip rationale for any untouched area:

Decision:
- `continue-research`
- `return-to-clarify`
- `context-sufficient`

Why:
- <why this decision is correct>

Next action:
- ...
```

Rules:
- keep it focused on missing context only
- prefer concrete evidence over speculation
- validate blast radius and protected boundaries, not just the most likely implementation path
- when the decision is `context-sufficient`, planning may begin
- when the decision is `return-to-clarify`, do not plan yet
