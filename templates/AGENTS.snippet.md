# AGENTS.md

## Codex Skills

This project uses local Codex skills installed under `~/.codex/skills`.

Recommended entry points:
- Use `$qc-flow` for non-trivial work that needs clarify, affected-area discussion, evidence-based planning, and durable artifacts.
- Use `$qc-lock` for tightly scoped execution work where the plan is already clear or can be made clear through a short preflight.

Resume convention:
- Prefer resuming from `.quick-codex-flow/<run-file>.md` instead of rebuilding context from chat.
- Treat the run artifact as the source of truth when chat context and artifact state diverge.
