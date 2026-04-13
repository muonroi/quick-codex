# Examples

Use these as starting prompts.

## Large Feature

```text
Use $qc-flow for this task: add a safer multi-repo sync preview mode to repo-tool. Clarify the requirements first, research the current script behavior, verify the plan before coding, then execute sequentially with artifacts.
```

## Bug Fix

```text
Use $qc-lock for this task: fix repo-tool so a missing branch name fails cleanly in switch mode. Keep the plan short, lock the scope, verify with direct command output, and fix within the same step if verification fails.
```

## Small Refactor

```text
Use $qc-lock for this task: simplify duplicated help-routing logic in repo-tool without changing visible behavior. Keep the plan explicit and verify the command outputs before moving on.
```

## Resume From Run Artifact

```text
Use $qc-flow and resume from .quick-codex-flow/<run-file>.md. Restate the current gate, current phase, current wave, remaining blockers, and continue from the locked state instead of rebuilding context from chat.
```

## Front-Half Then Handoff

```text
Use $qc-flow for this task until the plan is verified. Once the remaining work is implementation-only, switch to $qc-lock for the execution steps.
```
