# .quick-codex-flow

Shared configuration lives in `wrapper-config.json`. Mutable work belongs to one
trusted Codex thread or explicit `--session <id>`:

```text
.quick-codex-flow/
  wrapper-config.json
  sessions/<thread-id>/
    .session.json
    STATE.md                  # discovery pointers only
    runs/<task>.md            # one owner run
    locks/<task>.md           # only for standalone locked work
```

New runs use `Artifact profile: lean`. Read and update `Current Status` for current
gate, phase/wave, mode, blockers, and next action. Put superseded facts in History.
Keep a short roadmap in the run and detail only the active wave. `Verification Plan`
uses `Group | Kind | Command`; `verify-wave` writes bounded evidence and a source-bound
receipt, and `close-wave` requires all planned commands to pass.

Create session-local `PROJECT-ROADMAP.md` and `BACKLOG.md` only when cross-run
coordination or deferred work needs them. Registers, reviewers, delegation, and
Experience sections are conditional on real entries or environment requirements.
Assigned gates remain blocking for their dependent work. Checkpoints alone do not
require new approval; continue independently authorized work.

Existing expanded runs and their generated digests remain supported. Root-level
flat state is legacy; use `--legacy` or copy it with
`quick-codex migrate-state --to-session <thread-id>`. Never choose a namespace by
timestamps or overwrite another session's pointers.

Use `status`, `resume`, `verify-wave`, `close-wave`, and `doctor-run` for normal
work. `repair-run` restores a lean discovery pointer without expanding the run.
