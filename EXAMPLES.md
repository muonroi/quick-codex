# Examples

Use these as starting prompts.

## Codex Lost The Thread

```text
Use $qc-flow for this task: Codex keeps losing the thread on this medium task. Create a persistent run artifact, surface the full affected area, prove context sufficiency before planning, and make the next command explicit.
```

## Resume After Interruption

```text
Use $qc-flow and resume from .quick-codex-flow/<run-file>.md. Restate the current gate, execution mode, current phase and wave, blockers, burn risk, approval strategy, next verify, and continue from file state instead of chat memory.
```

Useful local commands:

```bash
node bin/quick-codex.js status --dir /path/to/project
node bin/quick-codex.js resume --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
```

## Large Feature

```text
Use $qc-flow for this task: add a safer multi-repo sync preview mode to repo-tool. Clarify the requirements first, surface the full affected area, research the current script behavior, verify the evidence basis and the plan before coding, then execute sequentially with artifacts.
```

## Bug Fix

```text
Use $qc-lock for this task: fix repo-tool so a missing branch name fails cleanly in switch mode. If no verified `qc-flow` run exists, do a short preflight first. Keep the plan short, lock the scope, verify with direct command output, and fix within the same step if verification fails.
```

## Small Refactor

```text
Use $qc-lock for this task: simplify duplicated help-routing logic in repo-tool without changing visible behavior. Keep the plan explicit, name the protected boundaries, and verify the command outputs before moving on.
```

## Resume From Run Artifact

```text
Use $qc-flow and resume from .quick-codex-flow/<run-file>.md. Restate the current gate, current phase, current wave, remaining blockers, and continue from the locked state instead of rebuilding context from chat.
```

## Front-Half Then Handoff

```text
Use $qc-flow for this task until the affected area, evidence basis, and plan are verified. Once the remaining work is implementation-only, switch to $qc-lock for the execution steps.
```
