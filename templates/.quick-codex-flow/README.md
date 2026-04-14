# .quick-codex-flow

Use this directory for persistent run artifacts created by `qc-flow`.

Keep two kinds of files here:
- one run file per active task
- one `STATE.md` file that points to the active run when you return after a clean session

Suggested rules:
- one run file per task
- prefer stable task slugs
- keep `STATE.md` aligned with the active run
- keep `Affected area / blast radius` and `Evidence Basis` current enough to justify the next plan or handoff
- keep the latest `Resume Digest` and `Recommended Next Command` current
- keep `Experience Snapshot` current when a hook warning changes scope, verify, or invariants
- refresh `Compact-Safe Summary` after each completed wave or phase and before any long verify or pause
- resume from the run file instead of relying on chat memory
- use `quick-codex status`, `quick-codex resume`, `quick-codex checkpoint-digest`, `quick-codex repair-run`, and `quick-codex doctor-run` to avoid guessing from chat state
