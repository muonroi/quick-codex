# Project Roadmap Template

Recommended path:

```text
.quick-codex-flow/PROJECT-ROADMAP.md
```

Use this file for project-level governance across multiple flow runs.

```markdown
# Quick Codex Project Roadmap

## Project Roadmap
Project goal:
- ...

Current milestone:
- M1

Current track:
- default

| Milestone | Status | Outcome | Active runs | Depends on | Exit verification |
|---|---|---|---|---|---|
| M1 | active | ... | .quick-codex-flow/<run>.md | none | ... |
| M2 | planned | ... | none | M1 | ... |

## Active Run Register
| Run | Status | Gate | Roadmap phase | Milestone | Track | Summary |
|---|---|---|---|---|---|---|
| .quick-codex-flow/<run>.md | active | execute | P1 | M1 | default | ... |

## Cross-Run Dependency Register
| ID | Scope | Depends on | Why | Status |
|---|---|---|---|---|
| DEP1 | ... | ... | ... | watch |
```

Rules:
- milestone rows are project-level, not run-level
- active run register should reflect all non-done runs that matter to the milestone
- cross-run dependencies should survive session resets even when the active run changes
