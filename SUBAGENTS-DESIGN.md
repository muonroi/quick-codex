# Quick Codex Subagents Design

## Goal

Define the first defensible way for `quick-codex` to use Codex subagents without turning the package into a heavy orchestration framework.

Design stance:
- keep `quick-codex` a workflow layer, not a project operating system
- use subagents only where they add clear signal
- keep the first slice opt-in
- preserve resumability, auditability, and compact-safe recovery as the package's core identity

## Why Now

Codex now supports subagent workflows in current releases, surfaces them in the app and CLI, and ships built-in `default`, `worker`, and `explorer` agents. Codex only spawns subagents when explicitly asked, and subagent workflows consume more tokens than comparable single-agent runs. Custom agents can be defined under `~/.codex/agents/` or `.codex/agents/`.

That creates a narrow opportunity:
- `quick-codex` can exploit subagents for read-heavy research and verification sidecars
- `quick-codex` should not make subagents the default path for every task

Sources:
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/cli/features

## Product Position

`quick-codex` should remain:
- single-agent by default
- subagent-aware when explicit value exists
- file-state-first for durability

It should not become:
- a recursive multi-agent manager
- an always-on fan-out orchestrator
- a package that hides cost growth behind automatic delegation

## Minimum Feature Set

### 1. Opt-in subagent mode in `qc-flow`

Add a small policy concept:
- `subagent mode: off | research-only | verify-sidecar | targeted-write`

Default:
- `off`

Allowed first-slice behavior:
- `research-only`
  - spawn only read-only explorers or docs researchers
  - use only when context sufficiency has a few independent open questions
- `verify-sidecar`
  - spawn read-only reviewer or verifier agents after a wave or at phase close
  - main agent stays responsible for the decision and artifact update

Do not ship in v1:
- broad write-side delegation
- subagents inside `qc-lock`
- automatic fan-out based only on heuristics

### 2. Parallel research sidecar in `qc-flow`

Use case:
- several codebase questions can be answered independently
- the next local planning step does not block on a single one of them exclusively

Pattern:
- main agent keeps the run artifact and planning authority
- 2 to 4 subagents gather code or docs evidence in parallel
- main agent synthesizes findings into `Research Pack` and `Verified Plan`

Guardrails:
- only for independent questions
- only when read-heavy work materially shortens the front-half
- never duplicate the same question across agents

### 3. Verification sidecar at wave close or phase close

Use case:
- implementation is already done
- a second read-only pass can catch correctness, security, or test-surface risks

Pattern:
- main agent performs the implementation and narrow verification
- one reviewer/verifier subagent runs in parallel or immediately after
- findings are folded into `Verification Ledger` and next decision

Guardrails:
- reviewer/verifier must be read-only in v1
- the main agent decides whether a finding requires relock or a fix
- do not block small, clean waves on mandatory sidecar review

### 4. Project-scoped custom agent templates

Ship example TOML templates under something like:

```text
templates/.codex/agents/
```

First set:
- `qc-research-explorer.toml`
- `qc-reviewer.toml`
- `qc-docs-researcher.toml`

Optional later:
- `qc-ui-debugger.toml`
- `qc-fixer.toml`

### 5. Artifact discipline for delegated work

Whenever `qc-flow` uses subagents, the run file must record:
- why subagents were used
- which questions or checks were delegated
- which agent template handled each one
- what result changed the plan or verify decision

This keeps subagents from becoming invisible background behavior.

## Skill Wording Changes

### `qc-flow` wording changes

Add a short section near the top:

`Subagent stance`
- default to single-agent execution
- allow subagents only when the user explicitly asks or when the active mode explicitly enables `research-only` or `verify-sidecar`
- prefer read-only subagents first
- the parent agent owns the run artifact, the final synthesis, and the next command

Add to `Research loop`:
- when several missing-context questions are independent, optional read-only explorers may gather evidence in parallel
- do not spawn subagents for a single blocking question that the parent agent can answer directly

Add to `Plan check`:
- confirm whether subagent use is still justified or should stay off

Add to `Sequential execution handoff`:
- do not delegate locked execution by default
- if a verification sidecar is used, record it in the run artifact before moving on

Add to `Compressed handoff`:
- carry `subagent mode`
- carry outstanding delegated questions if any

Add explicit anti-patterns:
- do not spawn subagents just because the task is large
- do not use subagents to compensate for a weak plan
- do not delegate artifact ownership
- do not let subagent results bypass `plan-check`, `phase-close`, or `Verification Ledger`

### `qc-lock` wording changes

Keep changes minimal:
- state that `qc-lock` remains single-agent by default
- allow an optional read-only review sidecar only after a verified step if the user explicitly asks
- do not allow delegated write execution in v1

### CLI/docs wording changes

Update docs only after implementation:
- explain that subagents are opt-in and cost more
- explain the first supported modes: `research-only` and `verify-sidecar`
- document the shipped agent templates and where they are installed

## Agent Templates To Ship

### 1. `qc_research_explorer`

Purpose:
- read-heavy codebase exploration before changes

Recommended defaults:
- model: `gpt-5.4-mini` or similar cheaper exploration tier
- reasoning: `medium`
- sandbox: `read-only`

Instructions:
- stay in exploration mode
- map execution paths, relevant files, and unresolved risks
- cite files and symbols
- do not propose code changes unless explicitly asked

### 2. `qc_reviewer`

Purpose:
- correctness, security, and missing-test review after a wave or at phase close

Recommended defaults:
- model: `gpt-5.4`
- reasoning: `high`
- sandbox: `read-only`

Instructions:
- prioritize correctness, regressions, and verification gaps
- lead with concrete findings
- avoid style-only comments unless they hide a real bug
- do not edit files

### 3. `qc_docs_researcher`

Purpose:
- confirm framework or API details through docs or MCP-backed sources

Recommended defaults:
- model: `gpt-5.4-mini`
- reasoning: `medium`
- sandbox: `read-only`

Instructions:
- verify version-sensitive behavior
- return concise answers with links or exact references
- do not edit files

### 4. Later-only templates

Do not ship in the first slice unless a benchmark proves the need:
- `qc_ui_debugger`
- `qc_fixer`
- any template that edits broad code areas

## Rollout Plan

### Phase 1: Docs and templates only

Ship:
- agent templates
- wording updates in `qc-flow`
- one design/usage doc

Do not ship:
- automatic spawning logic
- write-capable delegation

Goal:
- give advanced users a supported pattern without changing default behavior

### Phase 2: Opt-in workflow guidance

Ship:
- explicit prompt patterns for `research-only` and `verify-sidecar`
- examples showing when to use built-in `explorer` vs custom templates

Goal:
- make subagent use reproducible before automating anything

### Phase 3: Optional helper surface

Only if evidence is strong:
- helper commands or small scaffolding to copy agent templates into a project
- optional CLI assistance for summarizing delegated results into artifacts

Do not build before proof:
- hidden orchestration
- automatic spawn heuristics
- CSV batch fan-out features

## Benchmarks Needed

The benchmark question is not “can subagents work?”
It is “do subagents improve `quick-codex` without breaking its lightweight reliability story?”

### Benchmark 1: Parallel research win

Scenario:
- medium repo task with 3 independent context questions

Compare:
- single-agent `qc-flow`
- `qc-flow` with `research-only` explorers

Measure:
- time to verified plan
- number of turns to context sufficiency
- whether the final plan changed materially
- token/cost increase vs time saved

Success:
- faster planning with clearer evidence and no artifact drift

### Benchmark 2: Verification sidecar value

Scenario:
- completed wave with a plausible hidden regression risk

Compare:
- normal wave close
- wave close plus `qc-reviewer`

Measure:
- meaningful findings caught
- false-positive rate
- extra cost and latency
- whether the sidecar changed the relock/fix decision

Success:
- catches real risks often enough to justify optional use

### Benchmark 3: Resume integrity under subagent use

Scenario:
- `qc-flow` task with sidecar research or review, then forced pause or context reset

Measure:
- can the parent artifact reconstruct state cleanly?
- are delegated results captured in `Resume Digest` and `Compact-Safe Summary`?
- does resume still avoid relying on chat memory?

Success:
- no loss of workflow authority or resumability

### Benchmark 4: Cost discipline

Scenario:
- compare the same task under single-agent vs subagent-enabled paths

Measure:
- token increase
- time decrease
- net quality gain

Success:
- clear guidance emerges for when subagents are worth the premium

### Benchmark 5: Anti-drift preservation

Scenario:
- long task with multiple waves

Measure:
- whether subagent use increases scope drift
- whether the parent agent keeps plan ownership and artifact quality

Success:
- no regression in `quick-codex` core reliability story

## Recommendation

The best first implementation is:
- keep `quick-codex` single-agent by default
- make only `qc-flow` subagent-aware in v1
- support only `research-only` and `verify-sidecar`
- ship 3 narrow read-mostly agent templates
- prove the value with benchmarks before adding any automatic spawning or delegated writes

This keeps the package aligned with its current identity:

`Quick Codex is a durable workflow layer for Codex, not a general-purpose multi-agent operating system.`
