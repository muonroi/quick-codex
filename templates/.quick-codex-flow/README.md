# .quick-codex-flow

Use this directory for persistent run artifacts created by `qc-flow`.

Keep two kinds of files here:
- one run file per active task
- one `STATE.md` file that points to the active run when you return after a clean session
- one `PROJECT-ROADMAP.md` file for milestone and active-run governance
- one `BACKLOG.md` file for parking-lot items, deferred decisions, and future seeds

Suggested rules:
- one run file per task
- prefer stable task slugs
- keep `STATE.md` aligned with the active run
- keep `PROJECT-ROADMAP.md` aligned with the active milestone, active run register, and cross-run dependencies
- keep `BACKLOG.md` aligned with intentionally parked work, deferred decisions, and future seeds
- keep `Affected area / blast radius` and `Evidence Basis` current enough to justify the next plan or handoff
- keep `Delegation State` current when a blocking `research`, `plan-check`, or `goal-audit` checkpoint is assigned
- keep the latest `Resume Digest` and `Recommended Next Command` current
- keep `Experience Snapshot` current when a hook warning changes scope, verify, or invariants
- refresh `Compact-Safe Summary` after each completed wave or phase and before any long verify or pause
- resume from the run file instead of relying on chat memory
- use `quick-codex status`, `quick-codex resume`, `quick-codex project-status`, `quick-codex sync-project`, `quick-codex delegate-plan-check`, `quick-codex complete-delegation`, `quick-codex checkpoint-digest`, `quick-codex repair-run`, `quick-codex doctor-run`, and `quick-codex doctor-project` to avoid guessing from chat state
