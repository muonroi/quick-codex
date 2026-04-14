# Task Selection

Use this lightweight triage before choosing a skill or a recovery command.

## Start From The Pain Point

If the pain point is:
- "Codex is losing the thread" -> use `qc-flow`
- "This task may drift" -> use `qc-flow`
- "I want a step-by-step fix with verification" -> use `qc-lock`
- "I came back after two days and do not trust chat memory" -> use `quick-codex status` and `quick-codex resume`
- "I do not know whether the run file is still healthy" -> use `quick-codex doctor-run`

## Quick Triage

Answer these:

1. Are the requirements already clear?
2. Do I know the relevant repo area and files?
3. Is the affected area and blast radius already explicit?
4. Do I need research before planning?
5. Do I already have evidence that supports the planned scope?
6. Will this likely span multiple turns?
7. Is the remaining work mostly implementation?
8. Is any gray area still active about user intent, affected area, contracts, or verify path?

## Choose a Skill

Pick `qc-flow` when:
- one or more answers above are `no`
- the task needs clarify or research
- the affected area or protected boundaries are still fuzzy
- phase boundaries matter
- any gray area is still active

Pick `qc-lock` when:
- the requirements are already clear
- the repo area is already known
- the affected area is already explicit, or can be proven quickly in preflight
- the evidence basis for the lock is already known
- the task is mostly execution and verification
- no gray-area trigger remains active

Use the recovery commands when:
- the task already has a run artifact
- you want the current gate, risks, and next command without rereading everything
- you need deterministic routing from file state instead of chat memory

## Artifact Naming Convention

Use predictable names so resume stays easy.

- task slug:
  - lowercase
  - words separated by `-`
  - concise but specific
  - example: `repo-tool-sync-preview`
- run artifact:
  - `.quick-codex-flow/<task-slug>.md`
- phase id:
  - `P1`, `P2`, `P3`
- wave id:
  - `W1`, `W2`, `W3`
- relock version:
  - `v1`, `v2`, `v3`

If the task changes materially:
- relock
- increment the relock version
- keep the same task slug unless the task itself changes identity

## Anti-Drift Reminder

Do not switch to `qc-lock` early just because implementation looks easy.

Only switch when:
- the plan is already verified
- the affected area and protected boundaries are already explicit
- the remaining work is tightly scoped
- the handoff can be described in one current execution target
