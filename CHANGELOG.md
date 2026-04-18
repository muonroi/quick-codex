# Changelog

## Unreleased

## 0.4.7

Highlights:
- stabilized the rich Ink TUI layout so panes no longer overflow and "push" the header off-screen on smaller terminals
- improved the Result pane readability with a longer preview window, consistent scroll hinting, and stable panel height

## 0.4.0

Highlights:
- added `Experience Snapshot` to the `qc-flow` run-file contract so hook-derived warnings can survive resume and compaction-sensitive handoffs
- extended `status`, `resume`, `repair-run`, and `doctor-run` to carry and validate experience-aware resumability fields
- added `capture-hooks` so recent Experience Engine warning text can be synced into `Experience Snapshot` without manual copy-paste per field
- added `sync-experience` so a concrete tool action can be sent to Experience Engine `/api/intercept` and merged into the active run automatically
- updated templates and docs so Experience Engine is part of the resume contract, not only a side-channel suggestion
- added deliberate compaction proofs for carry-forward footprint, brain-advised session action, and `compact` versus `clear` checkpoint modes
- taught `qc-flow` to treat `Verified Plan` as a feature roadmap, keep native planner mirrors aligned with that roadmap, and close the run with `Latest Feature Close` when the final roadmap phase completes

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
