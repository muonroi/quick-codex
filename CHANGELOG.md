# Changelog

## 0.3.0

Highlights:
- added benchmark proof docs for resume reliability, verification thrash, scope drift, failure recovery, and product positioning
- polished the README into a stronger OSS narrative with a dedicated proof section
- added npm-backed update notices so older CLI installs can see when a newer published package exists
- extended `uninstall` so it can also remove quick-codex project scaffolds when `--dir` is provided explicitly
- tightened git hygiene guidance so coding waves and phases checkpoint with small commits instead of accumulating noisy worktree drift
- kept the recovery surface explicit with `status`, `resume`, and `doctor-run`, plus `STATE.md`-based active-run discovery

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
