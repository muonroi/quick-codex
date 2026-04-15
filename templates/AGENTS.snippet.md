# AGENTS.md

## Codex Skills

This project uses local Codex skills installed under `~/.agents/skills` by default. Legacy installs under `~/.codex/skills` are still supported when explicitly targeted.

Recommended entry points:
- Use `$qc-flow` for non-trivial work that needs clarify, affected-area discussion, evidence-based planning, and durable artifacts.
- Use `$qc-lock` for tightly scoped execution work where the plan is already clear or can be made clear through a short preflight.

Resume convention:
- Prefer resuming from `.quick-codex-flow/<run-file>.md` instead of rebuilding context from chat.
- Treat the run artifact as the source of truth when chat context and artifact state diverge.
- Treat `.quick-codex-lock/<task>.md` as the source of truth for locked execution details when `qc-lock` is active.
- When Codex exposes a native planner, use it as a short progress mirror only; do not treat it as the source of truth.
- At checkpoints, keep the planner explicit about whether the next operator action is `compact`, `clear`, or `relock`.
- Treat `.quick-codex-flow/STATE.md` as the pointer surface only: `Active run` points to the main continuity artifact and optional `Active lock` points to the currently active lock handoff.
- Treat `AGENTS.md` as entry guidance, not as the authoritative continuity state.

Continuity contract:
- The shared continuity contract lives in `CONTINUITY-CONTRACT.md`.
- Use that contract to decide which surface owns baseline, state, resume, risk, experience, and proof continuity.
