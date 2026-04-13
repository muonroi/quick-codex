# .quick-codex-flow

Use this directory for persistent run artifacts created by `qc-flow`.

Suggested rules:
- one run file per task
- prefer stable task slugs
- keep the latest `Resume Digest` and `Recommended Next Command` current
- prefer explicit resume from the run file instead of relying on chat memory
- keep `STATE.md` pointing at the current non-`done` run as the fallback active-run pointer
- use `STATE.md` only when you want to continue current work but do not have the run-file path ready
