<p align="center">
  <h1 align="center">Quick Codex</h1>
  <p align="center">
    <strong>Make Codex CLI more resumable, auditable, and harder to derail on medium-sized work.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> ·
    <a href="#why-quick-codex">Why Quick Codex</a> ·
    <a href="#proof">Proof</a> ·
    <a href="#how-it-works">How It Works</a> ·
    <a href="#which-skill-to-use">Which Skill to Use</a> ·
    <a href="#cli">CLI</a> ·
    <a href="#troubleshooting">Troubleshooting</a>
  </p>
  <p align="center">
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-yellow">
    <img alt="Node.js 18+" src="https://img.shields.io/badge/node-18%2B-green">
    <img alt="npm version" src="https://img.shields.io/npm/v/quick-codex">
    <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/muonroi/quick-codex/lint.yml?branch=main&label=lint">
    <img alt="npm downloads" src="https://img.shields.io/npm/dm/quick-codex">
    <img alt="Codex Only" src="https://img.shields.io/badge/runtime-Codex-blue">
    <img alt="Install Local" src="https://img.shields.io/badge/install-local-orange">
  </p>
</p>

---

Codex is strong at focused execution. It gets weaker when the workflow lives only in chat memory.

Quick Codex gives Codex a small, local workflow layer:
- `qc-flow` for front-half thinking, affected-area discussion, evidence-based planning, active-run discovery, and durable execution artifacts
- `qc-lock` for strict `preflight -> plan -> lock -> execute -> verify -> fix`
- local recovery commands so resume does not depend on remembering artifact shape by hand

The goal is simple: keep non-trivial work readable, resumable, and harder to derail.

In practice, that means:
- resume from files instead of guessing from stale chat state
- surface blast radius before implementation pretends to be obvious
- force planning to rest on repo evidence or an explicit research-skip rationale
- treat unresolved gray areas as a hard stop for fast-path and premature execution lock
- keep scope tight once execution starts
- make verification explicit so failures narrow the next move instead of causing thrash
- carry forward hook-derived constraints so compaction does not erase relevant Experience Engine warnings

## Why Quick Codex

Without a workflow layer:

```text
Turn 1: clarify a medium-sized task
Turn 2: research a few gaps
Turn 3: start implementation
Turn 6: context is fuzzy, next step is unclear, drift starts
```

With Quick Codex:

```text
Turn 1: create a run artifact with baseline, risks, and a checked plan
Turn 2: resume from the artifact, not from memory
Turn 3: execute one wave or one locked step
Turn 6: next command is already written down
```

Quick Codex is for teams and solo developers who want:
- stronger planning before coding
- explicit handoff from plan to execution
- durable state across long tasks
- a cleaner way to resume after interruptions

It is especially useful when the pain point is:
- "Codex keeps losing the thread"
- "This task tends to drift after a few turns"
- "I want step-by-step execution with real verification"
- "I came back later and do not trust the current chat state"

## Proof

Quick Codex is trying to solve a narrow set of Codex CLI pain points, so the proof should stay narrow too.

Current proof set:
- [Resume After Interruption](./BENCHMARK-PROOF.md): shows the package can recover the active run, next gate, and next prompt from local state instead of chat memory
- [Verification Thrash](./BENCHMARK-PROOF-THRASH.md): shows a real fail -> narrow -> fix loop instead of repeating broad checks blindly
- [Scope Drift](./BENCHMARK-PROOF-DRIFT.md): shows how explicit artifacts and locked execution reduce mid-task drift
- [Failure Recovery](./BENCHMARK-PROOF-FAILURE.md): shows recovery behavior when the workflow gets awkward or partial rather than ideal
- [Positioning](./BENCHMARK-PROOF-POSITIONING.md): explains the product claim this package can defend today without overclaiming
- [Workflow Hardening](./BENCHMARK-PROOF-WORKFLOW-HARDENING.md): shows the updated workflow now forces affected-area discussion, evidence-based planning, and `qc-lock` preflight more explicitly than before

The benchmark index lives in [BENCHMARKS.md](./BENCHMARKS.md).

## Quick Start

### Option A: Install from npm

```bash
npx quick-codex install
```

This installs:
- `qc-flow`
- `qc-lock`

into:

```text
~/.codex/skills
```

Then restart Codex.

### Option B: Local checkout via `npx`

From this repository root:

```bash
npx --yes ./quick-codex install
```

### Option C: Direct CLI usage from the package root

```bash
cd quick-codex
node bin/quick-codex.js install
```

### Option D: Development symlinks

```bash
mkdir -p ~/.codex/skills
ln -s /path/to/repo/qc-flow ~/.codex/skills/qc-flow
ln -s /path/to/repo/qc-lock ~/.codex/skills/qc-lock
```

If you prefer copies instead of symlinks:

```bash
mkdir -p ~/.codex/skills
cp -R /path/to/repo/qc-flow ~/.codex/skills/
cp -R /path/to/repo/qc-lock ~/.codex/skills/
```

### First commands after install

For a non-trivial task:

```text
Use $qc-flow for this task: ...
```

For a tightly scoped execution task:

```text
Use $qc-lock for this task: ...
```

## What Quick Codex Changes

Raw Codex can already code well. The problem is not code generation alone. The problem is task durability.

| | Raw Codex usage | Quick Codex |
|---|---|---|
| **Planning state** | Often lives in chat only | Lives in explicit artifacts |
| **Resume after interruption** | Easy to lose the thread | Resume from run file and `STATE.md` |
| **Large-task handoff** | Often implicit | Explicit next command |
| **Execution control** | Can drift on medium tasks | `qc-lock` keeps the loop strict |
| **Recovery surface** | Reconstruct state manually | `status`, `resume`, and `doctor-run` |
| **Workflow surface** | Ad hoc per session | Reusable conventions |

## How It Works

```text
YOU start with a task
  │
  ├─ qc-flow
  │   └─ clarify
  │   └─ surface affected area / blast radius
  │   └─ check context sufficiency
  │   └─ research only missing pieces
  │   └─ verify the evidence basis for planning
  │   └─ verify the plan
  │   └─ decompose into phases and waves
  │   └─ recommend the next command
  │
  └─ qc-lock
      └─ preflight if upstream plan is weak
      └─ plan
      └─ lock
      └─ execute one step
      └─ verify
      └─ fix if needed
      └─ repeat without drifting scope
```

The common idea is that workflow state should live in files, not just in chat.

Quick Codex is not trying to be a project operating system. It is trying to solve a smaller Codex CLI problem set well:
- task durability when work spans multiple turns
- reliable resume after interruption or stale session state
- scope drift during medium-sized engineering tasks
- verification thrash where the same broad checks are repeated without narrowing
- vague handoff between planning and execution

This is why the package stays small and local-first.

## Which Skill to Use

Use `qc-flow` when:
- the task is non-trivial
- requirements are unclear
- repo context is incomplete
- the affected area is not yet explicit
- research or planning should happen before coding
- the work may span multiple turns
- any gray area is still active

Use `qc-lock` when:
- the problem is already understood
- the affected area is already explicit, or can be proven quickly in a small preflight
- the remaining work is mostly execution
- you want strict step-by-step verification
- the scope needs to stay tight
- no gray-area trigger remains active

### Decision Table

| Situation | Recommended skill | Why |
|---|---|---|
| Large feature, unclear requirements, or missing repo context | `qc-flow` | It clarifies, surfaces affected area, researches, verifies the evidence basis, then executes sequentially |
| Bug fix with known scope | `qc-lock` | It stays close to `preflight -> plan -> lock -> execute -> verify -> fix` |
| Small refactor with known files but some local risk | `qc-lock` | It keeps scope narrow, can do a short preflight, and verifies each step |
| Long-running task that may span multiple turns | `qc-flow` | It relies on persistent run artifacts and resume state |
| Existing run artifact already in progress under `qc-flow` | `qc-flow` | Resume from the run artifact instead of switching midstream |
| Task began with `qc-flow` but execution is now fully understood and tightly scoped | `qc-lock` | Hand off to a stricter executor once the front-half is complete |

### When to switch

Switch from `qc-flow` to `qc-lock` when:
- clarify, affected-area discussion, research, and plan-check are already done
- the remaining work is implementation-focused
- the evidence basis for the current scope is still current
- the scope is narrow enough for locked step-by-step execution

Stay on `qc-flow` when:
- requirements are still moving
- repo context is still incomplete
- blast radius is still fuzzy
- a relock is likely
- phase boundaries still matter

## What gets installed

```text
.
├── qc-flow/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   └── references/
├── qc-lock/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   └── references/
├── bin/quick-codex.js
├── scripts/lint-skills.sh
└── templates/
```

Supporting docs:
- [CONTINUITY-CONTRACT.md](./CONTINUITY-CONTRACT.md)
- [BENCHMARKS.md](./BENCHMARKS.md)
- [BENCHMARK-PROOF.md](./BENCHMARK-PROOF.md)
- [BENCHMARK-PROOF-THRASH.md](./BENCHMARK-PROOF-THRASH.md)
- [BENCHMARK-PROOF-DRIFT.md](./BENCHMARK-PROOF-DRIFT.md)
- [BENCHMARK-PROOF-FAILURE.md](./BENCHMARK-PROOF-FAILURE.md)
- [BENCHMARK-PROOF-POSITIONING.md](./BENCHMARK-PROOF-POSITIONING.md)
- [BENCHMARK-PROOF-WORKFLOW-HARDENING.md](./BENCHMARK-PROOF-WORKFLOW-HARDENING.md)
- [QUICKSTART.md](./QUICKSTART.md)
- [EXAMPLES.md](./EXAMPLES.md)
- [TASK-SELECTION.md](./TASK-SELECTION.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)

## CLI

```bash
quick-codex install [--copy] [--target <dir>]
quick-codex doctor [--target <dir>]
quick-codex init [--dir <project-dir>] [--force]
quick-codex status [--dir <project-dir>] [--run <path>]
quick-codex resume [--dir <project-dir>] [--run <path>]
quick-codex capture-hooks [--dir <project-dir>] [--run <path>] [--input <path>]
quick-codex sync-experience [--dir <project-dir>] [--run <path>] --tool <name> [--tool-input <json>] [--tool-input-file <path>] [--engine-url <url>] [--timeout-ms <ms>]
quick-codex checkpoint-digest [--dir <project-dir>] [--run <path>]
quick-codex snapshot [--dir <project-dir>] [--run <path>]
quick-codex repair-run [--dir <project-dir>] [--run <path>]
quick-codex doctor-run [--dir <project-dir>] [--run <path>]
quick-codex upgrade [--copy] [--target <dir>]
quick-codex uninstall [--target <dir>] [--dir <project-dir>]
```

Recommended usage:
- `install` installs `qc-flow` and `qc-lock` into `~/.codex/skills`
- `doctor` validates package shape, installed skills, and lint status
- `init` scaffolds `AGENTS.md`, `.quick-codex-flow/`, `STATE.md`, and a sample run artifact with an optional `Active lock` pointer
- `status` shows the active continuity artifact, gate, risks, and next verify for either a flow run or a lock artifact
- `resume` prints the exact next prompt(s) to paste when resuming, plus the active experience constraints that still matter for flow or lock execution
- `capture-hooks` parses hook text from a file or stdin and syncs it into `Experience Snapshot`
- `sync-experience` calls Experience Engine `/api/intercept` for a concrete tool action and syncs returned warnings into `Experience Snapshot`
- `checkpoint-digest` prints the compact-safe handoff that should survive context compaction or a pause
- `snapshot` is a shorter alias for `checkpoint-digest`
- `repair-run` backfills flow-run resumability sections, preserves compact lock artifacts, and realigns `STATE.md` for flow or lock handoff
- `doctor-run` validates a flow run or lock artifact against the continuity contract and checks the `STATE.md` handoff
- `upgrade` reruns install behavior and removes legacy skill names if present
- `uninstall` removes installed skills from the target path and can also remove project scaffolds when `--dir` is provided explicitly
- the CLI prints a short update notice when npm has a newer published version

Migration notes for older artifacts:
- older `qc-flow` runs can be repaired forward with `repair-run`
- older `qc-lock` artifacts should gain bridge fields incrementally: `Current gate`, `Current verify`, `Recommended next command`, `Blockers`, `Verification evidence`, and `Requirements still satisfied`
- do not copy `Resume Digest` or `Compact-Safe Summary` into `qc-lock`; keep the lock artifact compact

Minimum smoke-check path for continuity adoption:
- `bash scripts/lint-skills.sh`
- `node bin/quick-codex.js status --dir /path/to/project --run .quick-codex-flow/<run>.md`
- `node bin/quick-codex.js doctor-run --dir /path/to/project --run .quick-codex-flow/<run>.md`
- `node bin/quick-codex.js status --dir /path/to/project --run .quick-codex-lock/<task>.md`
- `node bin/quick-codex.js doctor-run --dir /path/to/project --run .quick-codex-lock/<task>.md`
- if `STATE.md` uses `Active lock`, confirm plain `status` and `resume` without `--run` resolve to the lock artifact

You can also run the CLI directly:

```bash
node bin/quick-codex.js doctor
node bin/quick-codex.js init --dir /path/to/project
node bin/quick-codex.js status --dir /path/to/project
node bin/quick-codex.js resume --dir /path/to/project
node bin/quick-codex.js capture-hooks --dir /path/to/project --input /path/to/hooks.txt
node bin/quick-codex.js sync-experience --dir /path/to/project --tool Write --tool-input '{"file_path":"src/app.ts"}'
node bin/quick-codex.js checkpoint-digest --dir /path/to/project
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
```

## Invocation Model

Skills are not MCP tools. They behave more like workflow overlays.

Explicit usage:

```text
Use $qc-flow for this task: ...
Use $qc-lock for this task: ...
```

Current metadata:
- `qc-flow` allows implicit invocation
- `qc-lock` is explicit-first

Important:
- implicit invocation is a convenience, not a guarantee
- for important tasks, call the skill explicitly

## Experience Engine Integration

Quick Codex works on its own, but it pairs well with [Experience Engine](https://github.com/muonroi/experience-engine).

For the authoritative field ownership and surface roles behind resume, lock, and scaffold behavior, see [CONTINUITY-CONTRACT.md](./CONTINUITY-CONTRACT.md).

Recommended routing for relevant hook warnings:
- `Clarify State` -> scope, constraints, open questions
- `Clarify State` -> affected area, protected boundaries, user-confirmed assumptions
- `Research Pack` -> evidence, answered questions, unresolved risks
- `Execution Wave` -> `Risks`, `Invariant requirements`, `Verify`
- `Phase Close` -> carry-forward notes, open risks
- `Experience Snapshot` -> active warnings, decision impact, carry-forward constraints, ignored warnings

Recommended routing for the hook `Why:` line:
- `Risks`
- `Invariant requirements`
- `Verify`

For resume-sensitive work, do not leave this as chat-only interpretation.
Persist the warning impact into the run file:
- `Resume Digest` -> `Experience constraints`
- `Compact-Safe Summary` -> `Experience constraints`
- `Compact-Safe Summary` -> `Active hook-derived invariants`

When you already have recent hook text, sync it directly:

```bash
node bin/quick-codex.js capture-hooks --dir /path/to/project --input /path/to/hooks.txt
```

When you want the engine to evaluate a concrete next tool action itself:

```bash
node bin/quick-codex.js sync-experience --dir /path/to/project --tool Write --tool-input '{"file_path":"src/app.ts"}'
```

If a warning is noisy and you intentionally ignore it, do not ignore it silently. Report it back so the engine can improve.

## Known Limits

Quick Codex improves workflow discipline around Codex. It does not change Codex core behavior.

It helps reduce:
- context drift across turns
- vague handoffs between planning and execution
- execution thrash on longer tasks
- approval confusion by making the strategy explicit

It does not fix:
- native Codex hangs or long internal wait states
- quota or usage opacity
- platform-level approval bugs
- model-level compaction bugs by itself

The package is best understood as a workflow layer:
- it helps the work survive those failures
- it does not fix the runtime bugs themselves
- it reduces the impact of these limits
- it does not remove the underlying platform behavior

## Contributing

If you want to customize or improve the package:
- read [CONTRIBUTING.md](./CONTRIBUTING.md)
- validate with `bash scripts/lint-skills.sh`
- test a real task with artifacts, not only the docs

## Troubleshooting

- `npx quick-codex install` fails:
  - wait a minute and retry if npm propagation is still catching up
  - or use the local fallback: `npx --yes ./quick-codex install`
- the CLI says an update is available:
  - refresh the published package and local skill install with `npx quick-codex@latest upgrade`
  - if you are running from a local checkout, pull the latest repo changes first
- `doctor-run` says the run is stale or incomplete:
  - run `node bin/quick-codex.js repair-run --dir /path/to/project`
  - rerun `node bin/quick-codex.js doctor-run --dir /path/to/project`
- `npx --yes ./quick-codex install` fails:
  - run `node bin/quick-codex.js install` from inside `quick-codex/`
- `npx` fails because npm cache is not writable:
  - run `npm_config_cache=/tmp/quick-codex-npm-cache npx quick-codex install`
  - or `npm_config_cache=/tmp/quick-codex-npm-cache npx --yes ./quick-codex install`
- Codex does not see the skills:
  - check `~/.codex/skills`
  - restart Codex after install or upgrade
- `doctor` reports missing local install:
  - run `install` first, then rerun `doctor`
- `init` should not overwrite my existing `AGENTS.md`:
  - the CLI writes `AGENTS.quick-codex-snippet.md` when `AGENTS.md` already exists
- You are unsure which skill to use:
  - start with `qc-flow`
  - switch to `qc-lock` only when the remaining work is tightly scoped
- You want to validate the package:
  - run `node bin/quick-codex.js doctor`
  - or `bash scripts/lint-skills.sh`
- You want to fully remove the package from a project as well as `~/.codex/skills`:
  - run `node bin/quick-codex.js uninstall --dir /path/to/project`
  - `AGENTS.md` is only removed if it exactly matches the quick-codex scaffold
