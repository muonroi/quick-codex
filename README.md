<p align="center">
  <h1 align="center">Quick Codex</h1>
  <p align="center">
    <strong>Codex workflow skills for tasks that need more than raw chat context.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> ·
    <a href="#why-quick-codex">Why Quick Codex</a> ·
    <a href="#how-it-works">How It Works</a> ·
    <a href="#which-skill-to-use">Which Skill to Use</a> ·
    <a href="#cli">CLI</a> ·
    <a href="#troubleshooting">Troubleshooting</a>
  </p>
  <p align="center">
    <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-yellow">
    <img alt="Node.js 18+" src="https://img.shields.io/badge/node-18%2B-green">
    <img alt="Codex Only" src="https://img.shields.io/badge/runtime-Codex-blue">
    <img alt="Install Local" src="https://img.shields.io/badge/install-local-orange">
  </p>
</p>

---

Codex is strong at focused execution. It is weaker when the real workflow lives only in chat memory.

Quick Codex gives Codex a small, local workflow layer:
- `qc-flow` for front-half thinking, checked planning, and durable execution artifacts
- `qc-lock` for strict `plan -> lock -> execute -> verify -> fix`

The goal is simple: keep non-trivial work readable, resumable, and harder to derail.

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

## Quick Start

### Option A: Local checkout via `npx`

From this repository root:

```bash
npx --yes ./quick-codex install
```

This installs:
- `qc-flow`
- `qc-lock`

into:

```text
~/.codex/skills
```

Then restart Codex.

### Option B: Direct CLI usage from the package root

```bash
cd quick-codex
node bin/quick-codex.js install
```

### Option C: Development symlinks

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

## Why not just use Codex directly?

Raw Codex can already code well. The problem is not code generation alone. The problem is task durability.

| | Raw Codex usage | Quick Codex |
|---|---|---|
| **Planning state** | Often lives in chat only | Lives in explicit artifacts |
| **Resume after interruption** | Easy to lose the thread | Resume from run file |
| **Large-task handoff** | Often implicit | Explicit next command |
| **Execution control** | Can drift on medium tasks | `qc-lock` keeps the loop strict |
| **Workflow surface** | Ad hoc per session | Reusable conventions |

## How It Works

```text
YOU start with a task
  │
  ├─ qc-flow
  │   └─ clarify
  │   └─ check context sufficiency
  │   └─ research only missing pieces
  │   └─ verify the plan
  │   └─ decompose into phases and waves
  │   └─ recommend the next command
  │
  └─ qc-lock
      └─ plan
      └─ lock
      └─ execute one step
      └─ verify
      └─ fix if needed
      └─ repeat without drifting scope
```

The common idea is that workflow state should live in files, not just in chat.

## Which Skill to Use

Use `qc-flow` when:
- the task is non-trivial
- requirements are unclear
- repo context is incomplete
- research or planning should happen before coding
- the work may span multiple turns

Use `qc-lock` when:
- the problem is already understood
- the remaining work is mostly execution
- you want strict step-by-step verification
- the scope needs to stay tight

### Decision Table

| Situation | Recommended skill | Why |
|---|---|---|
| Large feature, unclear requirements, or missing repo context | `qc-flow` | It clarifies, researches, verifies the plan, then executes sequentially |
| Bug fix with known scope | `qc-lock` | It stays close to `plan -> lock -> execute -> verify -> fix` |
| Small refactor with known files but some local risk | `qc-lock` | It keeps scope narrow and verifies each step |
| Long-running task that may span multiple turns | `qc-flow` | It relies on persistent run artifacts and resume state |
| Existing run artifact already in progress under `qc-flow` | `qc-flow` | Resume from the run artifact instead of switching midstream |
| Task began with `qc-flow` but execution is now fully understood and tightly scoped | `qc-lock` | Hand off to a stricter executor once the front-half is complete |

### When to switch

Switch from `qc-flow` to `qc-lock` when:
- clarify, research, and plan-check are already done
- the remaining work is implementation-focused
- the scope is narrow enough for locked step-by-step execution

Stay on `qc-flow` when:
- requirements are still moving
- repo context is still incomplete
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

The package also includes:
- [QUICKSTART.md](./QUICKSTART.md)
- [EXAMPLES.md](./EXAMPLES.md)
- [TASK-SELECTION.md](./TASK-SELECTION.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)

## CLI

```bash
quick-codex install [--copy] [--target <dir>]
quick-codex doctor [--target <dir>]
quick-codex init [--dir <project-dir>] [--force]
quick-codex upgrade [--copy] [--target <dir>]
quick-codex uninstall [--target <dir>]
```

Recommended usage:
- `install` installs `qc-flow` and `qc-lock` into `~/.codex/skills`
- `doctor` validates package shape, installed skills, and lint status
- `init` scaffolds `AGENTS.md`, `.quick-codex-flow/`, and a sample run artifact
- `upgrade` reruns install behavior and removes legacy skill names if present
- `uninstall` removes installed skills from the target path

You can also run the CLI directly:

```bash
node bin/quick-codex.js doctor
node bin/quick-codex.js init --dir /path/to/project
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

Recommended routing for relevant hook warnings:
- `Clarify State` -> scope, constraints, open questions
- `Research Pack` -> evidence, answered questions, unresolved risks
- `Execution Wave` -> `Risks`, `Invariant requirements`, `Verify`
- `Phase Close` -> carry-forward notes, open risks

Recommended routing for the hook `Why:` line:
- `Risks`
- `Invariant requirements`
- `Verify`

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
- it reduces the impact of these limits
- it does not remove the underlying platform behavior

## Contributing

If you want to customize or improve the package:
- read [CONTRIBUTING.md](./CONTRIBUTING.md)
- validate with `bash scripts/lint-skills.sh`
- test a real task, not only the docs

## Troubleshooting

- `npx --yes ./quick-codex install` fails:
  - run `node bin/quick-codex.js install` from inside `quick-codex/`
- `npx` fails because npm cache is not writable:
  - run `npm_config_cache=/tmp/quick-codex-npm-cache npx --yes ./quick-codex install`
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
