# Active Run State
- Active run: .quick-codex-flow/sample-run.md
- Current gate: plan-check
- Current phase / wave: P1 / W1
- Execution mode: manual
- Status: active

Bootstrap notes:
- This scaffold is a starter pointer for the sample run created by `init`.
- If the project already has a real active-run pointer, keep that file instead of overwriting it.

Routing notes:
- In `manual`, `qc-flow` reconstructs this run, confirms the current checkpoint, and stops with the next concrete command.
- In `auto`, switch `Execution mode` to `auto` only when the run file already makes the next safe move explicit.
- If the pointed run becomes `done`, clear or replace `Active run` instead of leaving stale state.
