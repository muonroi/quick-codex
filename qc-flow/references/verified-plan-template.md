# Verified Plan Template

Keep the roadmap in the run; do not create another plan file. Detail only the
active wave when its inputs and verification path are known.

```markdown
## Verified Plan
Goal: <feature or issue this run closes>
Plan inputs / evidence:
- <exact source, contract, or accepted decision>

| Phase | Status | Purpose | Depends on | Verify |
|---|---|---|---|---|
| P1 | in_progress | <outcome> | none | <exit condition> |
| P2 | pending | <future outcome only> | P1 | <exit condition> |

## Plan Check
- R1 -> current wave -> <behavior groups and executable checks>.
- Protected contracts: <evidence they remain covered>.
- Unresolved dependencies: none.
- Plan status: verified
```

Put active-wave files, steps, done conditions, and executable verification in
`Current Execution Wave` and `Verification Plan`. Avoid prewriting future waves.
A phase is verified only after all applicable groups have current passing proof;
a reviewer conclusion alone cannot close it. Preserve any required reviewer panel.
