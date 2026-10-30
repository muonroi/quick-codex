# AGENTS.md

## Codex Skills

This project uses local Codex skills installed under `~/.agents/skills` by default. Legacy installs under `~/.codex/skills` are still supported when explicitly targeted.

Required workflow routing for coding work larger than a trivial one-shot edit:
- Use `$qc-flow` when a requirement, affected area, protected boundary, repo fact, contract, or verification path is unresolved. Block dependent edits until that gray area is resolved; continue independent authorized work.
- Use `$qc-lock` only when the target, affected area, evidence basis, and verification path are already explicit or pass its short preflight. Lock scope and verify each step before advancing.
- Do not use fixed task-size or depth-to-workflow mappings. If a gray area reopens during `$qc-lock`, return to `$qc-flow` or keep researching before relocking.
- Purely informational requests and truly trivial one-shot edits may proceed without a persistent workflow artifact.

Resume convention:
- Keep mutable state under `.quick-codex-flow/sessions/<thread-id>/`; use the trusted Codex thread ID or an explicit `--session <thread-id>` selector.
- Prefer resuming from `runs/<run-file>.md` inside the selected session namespace instead of rebuilding context from chat.
- Treat the run artifact as the source of truth when chat context and artifact state diverge.
- For lean runs, update `Current Status` in place, move superseded facts to History, and detail only the active wave. Project governance and inactive registers are optional.
- Require executable evidence for every planned verification group. Checkpoints do not require renewed approval for already authorized work.
- Treat `locks/<task>.md` inside the selected session namespace as the source of truth for locked execution details when `qc-lock` is active.
- When Codex exposes a native planner, use it as a short progress mirror only; do not treat it as the source of truth.
- At checkpoints, keep the planner explicit about whether the next operator action is `compact`, `clear`, or `relock`.
- Treat `.quick-codex-flow/sessions/<thread-id>/STATE.md` as the pointer surface only: `Active run` and `Active lock` are session-root-relative (`runs/...` and `locks/...`).
- Read flat `.quick-codex-flow/*.md` and `.quick-codex-lock/*.md` only as labeled legacy state; migrate explicitly with `quick-codex migrate-state --to-session <thread-id>`.
- Treat `AGENTS.md` as entry guidance, not as the authoritative continuity state.

Continuity contract:
- The shared continuity contract lives in `CONTINUITY-CONTRACT.md`.
- Use that contract to decide which surface owns baseline, state, resume, risk, experience, and proof continuity.
