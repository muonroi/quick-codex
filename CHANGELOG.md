# Changelog

## 0.2.0

Highlights:
- added `Lean Budget Mode` across scaffold, docs, and `qc-flow` / `qc-lock`
- added `Burn Risk`, bounded output hygiene, and compressed handoff rules
- added `manual` and `auto` execution-mode guidance for both skills
- added `STATE.md`-based active-run discovery and deterministic next-step routing for `qc-flow`
- updated `init` to scaffold `.quick-codex-flow/STATE.md` safely without overwriting an existing active-run pointer
- aligned `README`, `QUICKSTART`, scaffolded `AGENTS.md`, and flow README with explicit-resume-first guidance
- strengthened code-task completion rules around build-clean and unit-test-pass requirements in touched scope
- runtime-verified the new resume/discovery flow and the locked execution loop on local temp-project scenarios before release
