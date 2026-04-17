# quick-codex — Deep Map

> Repo-level map for the Quick Codex package. Read this before exploring the repo.

---

## Purpose

`quick-codex/` is a lightweight workflow layer for Codex CLI. It ships:

- `qc-flow` for front-half task clarification, planning, and run artifacts
- `qc-lock` for strict execution loops
- `quick-codex` CLI for install, resume, status, verification, and repair flows

---

## Top-Level Entry Points

| Path | Purpose |
|------|---------|
| `README.md` | Primary product overview, install paths, workflow positioning |
| `QUICKSTART.md` | Fast installation and common CLI flows |
| `TASK-SELECTION.md` | When to use `qc-flow` vs `qc-lock` |
| `CHANGELOG.md` | Release-level change log |
| `CONTINUITY-CONTRACT.md` | Canonical continuity model for flow/lock artifacts |
| `package.json` | Package metadata, published files, CLI scripts |
| `bin/quick-codex.js` | CLI entry point for install/status/resume/doctor/verify flows |
| `bin/quick-codex-wrap.js` | Wrapper frontdoor entry point for raw-task routing, interactive wrapper-shell chat, rich/plain renderer selection, and artifact-driven Codex session orchestration |
| `bin/codex-qc-shim.js` | Codex-compatible shim that routes `codex --qc-*`, bare `codex`, and plain prompt launches into wrapper surfaces while keeping `--qc-bypass` for the real Codex CLI |
| `lib/wrapper/` | Wrapper parser, route classifier, active-run preference helper, orchestration helper, follow-loop helper, bootstrap helper, prompt compiler, decision engine, permission/config resolution, Experience Engine route-task + route-model clients, exec/app-server Codex adapters, rich TUI renderer, and wrapper-local state helpers |
| `WRAPPER.md` | Wrapper-specific frontdoor scope, commands, and limitations |

---

## Workflow Skill Surface

### `qc-flow/`

| Path | Purpose |
|------|---------|
| `qc-flow/SKILL.md` | Main planning workflow skill |
| `qc-flow/agents/` | Agent prompts used by the flow workflow |
| `qc-flow/references/run-file-template.md` | Canonical run-artifact template |
| `qc-flow/references/verified-plan-template.md` | Verified-plan template |
| `qc-flow/references/execution-wave-template.md` | Wave template for execution handoff |
| `qc-flow/references/context-gate-template.md` | Context sufficiency gate template |
| `qc-flow/references/research-pack-template.md` | Research pack template |
| `qc-flow/references/phase-close-template.md` | Phase close template |

### `qc-lock/`

| Path | Purpose |
|------|---------|
| `qc-lock/SKILL.md` | Locked execution workflow skill |
| `qc-lock/agents/` | Agent prompts used by the lock workflow |
| `qc-lock/references/locked-plan-template.md` | Locked-plan template |
| `qc-lock/references/run-file-template.md` | Persistent run-file template for locked execution |

---

## Package Scaffolding and Fixtures

| Path | Purpose |
|------|---------|
| `templates/AGENTS.snippet.md` | Snippet added to repo `AGENTS.md` during project init |
| `templates/.quick-codex-flow/` | Sample flow-state scaffolding, including `wrapper-config.json` for repo-level wrapper defaults |
| `.quick-codex-flow/` | Local example or validation artifacts used during development |
| `.quick-codex-lock/` | Local example lock artifacts used during development |

---

## Scripts and Tests

| Path | Purpose |
|------|---------|
| `scripts/install.sh` | Local install helper |
| `scripts/lint-skills.sh` | Skill/package linting before publish |
| `tests/flow-continuity.test.js` | Continuity coverage for flow artifacts |
| `tests/lock-continuity.test.js` | Continuity coverage for lock artifacts |
| `tests/test-helpers.js` | Shared test fixtures/helpers |

---

## Evidence and Positioning Docs

| Path | Purpose |
|------|---------|
| `BENCHMARKS.md` | Benchmark index |
| `BENCHMARK-PROOF*.md` | Proof documents for drift, failure recovery, workflow hardening, and related claims |
| `EXAMPLES.md` | Prompt and CLI usage examples |
| `SUBAGENTS-DESIGN.md` | Design notes for possible subagent support |
| `RELEASING.md` | Release checklist for npm publication |

---

## What to Read First by Task

| Task | Read first |
|------|-----------|
| Understand the product | `README.md`, `TASK-SELECTION.md` |
| Modify CLI behavior | `package.json`, `bin/quick-codex.js`, relevant tests |
| Change `qc-flow` behavior | `qc-flow/SKILL.md`, `qc-flow/references/` |
| Change `qc-lock` behavior | `qc-lock/SKILL.md`, `qc-lock/references/` |
| Validate continuity claims | `CONTINUITY-CONTRACT.md`, `tests/`, `BENCHMARK-PROOF*.md` |
