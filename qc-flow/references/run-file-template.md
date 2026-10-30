# Run File Template

Use one run per task under `.quick-codex-flow/sessions/<thread-id>/runs/`.
`Current Status` is authoritative; `STATE.md` only points here. Add conditional
sections only when they contain real information. Keep history out of current state.

```markdown
# Run: <task>
Artifact profile: lean

## Requirement Baseline
Original goal:
- <requested outcome>
Required outcomes:
- R1: <observable result>
Affected area / blast radius:
- <located files or modules>
Protected boundaries:
- <contracts and scope that must be preserved>

## Current Status
Current gate: research
Current phase: P1
Current wave: W1
Execution state: pending
Execution mode: auto
Blockers: none
Next verify: <next concrete check>
Recommended next command: <exact command or continuation prompt>

## Evidence Basis
- <file:line, revision, contract, or user decision that supports the next action>

## Verified Plan
| Phase | Status | Purpose | Depends on | Verify |
|---|---|---|---|---|
| P1 | pending | <milestone outcome> | none | <exit condition> |

## Current Execution Wave
Phase:
- P1
Wave:
- W1
Purpose:
- <one bounded change>
Covers requirements:
- R1
Files expected to change:
- <verified paths>
Done when:
- <observable result>
Invariant requirements:
- <protected contract>
Verify:
- <same executable checks as the verification plan>

## Verification Plan
| Group | Kind | Command |
|---|---|---|
| <observable behavior> | test | <exact executable command> |

## Verification Ledger
- none yet
```

Use `preflight`, `build`, `test`, `consumer`, or `deployed` as Kind. List commands
in an executable form (no multiline shell, pipes, or table delimiters). Only add a
preflight/build when needed. Multiple groups can share a command; it runs once.
Receipt and history are written by `verify-wave` and `close-wave`.

When needed, add `Gray Area Register` with columns
`ID | Type | Question | Owner | Resolution path | Status`; resolved rows use
`resolved`. Include which work depends on the answer in Question. For cross-run
governance add `Project Alignment` with `- Project board: PROJECT-ROADMAP.md`.
Keep optional Experience warnings and assigned reviewer panels in this same run.
Existing expanded artifacts remain compatible; do not migrate active runs merely
for formatting.
