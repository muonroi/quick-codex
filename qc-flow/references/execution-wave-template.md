# Execution Wave Template

Keep this section inside the owner run. It contains only the current wave's
scope; `Current Status` owns progress and `Verification Plan` owns executable checks.

```markdown
## Current Execution Wave
Phase:
- P1
Wave:
- W1
Purpose:
- <bounded outcome>
Covers requirements:
- R1
Files expected to change:
- <located paths>
Done when:
- <observable result>
Invariant requirements:
- <protected contracts>
Verify:
- <exact commands also listed by behavior in Verification Plan>

## Verification Plan
| Group | Kind | Command |
|---|---|---|
| cache-hit | test | node --test tests/cache-hit.test.js |
| cache-miss | test | node --test tests/cache-miss.test.js |
```

Enumerate the paths actually affected; this cache example is not a universal
checklist. Plan the next wave only after this wave's inputs and proof are available.
