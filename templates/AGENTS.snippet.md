# AGENTS.md

## Codex Skills

This project uses local Codex skills installed under `~/.codex/skills`.

Recommended entry points:
- Use `$qc-flow` for non-trivial work that needs clarify, affected-area discussion, evidence-based planning, and durable artifacts.
- Use `$qc-lock` for tightly scoped execution work where the plan is already clear or can be made clear through a short preflight.

Resume convention:
- Prefer resuming from `.quick-codex-flow/<run-file>.md` instead of rebuilding context from chat.
- Treat the run artifact as the source of truth when chat context and artifact state diverge.
- Treat `.quick-codex-lock/<task>.md` as the source of truth for locked execution details when `qc-lock` is active.
- Treat `.quick-codex-flow/STATE.md` as the pointer surface only: `Active run` points to the main continuity artifact and optional `Active lock` points to the currently active lock handoff.
- Treat `AGENTS.md` as entry guidance, not as the authoritative continuity state.

Continuity contract:
- The shared continuity contract lives in `CONTINUITY-CONTRACT.md`.
- Use that contract to decide which surface owns baseline, state, resume, risk, experience, and proof continuity.
