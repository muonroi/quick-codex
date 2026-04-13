# AGENTS.md

## Codex Skills

This project uses local Codex skills installed under `~/.codex/skills`.

Recommended budget mode:
- `{{BUDGET_MODE}}`
- Prefer `lean` when quota pressure matters, `balanced` for normal use, and `deep` only when extra planning depth is worth the cost.

Recommended entry points:
- Use `$qc-flow` for non-trivial work that needs clarify, research, planning, and durable artifacts.
- Use `$qc-lock` for tightly scoped execution work where the plan is already clear.

Resume convention:
- Prefer resuming from `.quick-codex-flow/<run-file>.md` instead of rebuilding context from chat.
- Treat `.quick-codex-flow/STATE.md` as the fallback pointer to the active run when you want to continue current work but do not have the run path in hand.
- Treat the run artifact as the source of truth when chat context and artifact state diverge.
