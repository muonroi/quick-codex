<p align="center">
  <h1 align="center">Quick Codex</h1>
  <p align="center">
    <strong>A bounded-context workflow layer for Codex CLI: resume cleanly, compact deliberately, and keep medium-sized work from drifting.</strong>
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

That gets worse when the task is larger than one clean burst: the context window gets crowded, the session may compact at an awkward moment, and the next safe move becomes fuzzy.

Quick Codex gives Codex a small, local workflow layer:
- `qc-flow` for front-half thinking, affected-area discussion, evidence-based planning, active-run discovery, and durable execution artifacts
- `qc-lock` for strict `preflight -> plan -> lock -> execute -> verify -> fix`
- local recovery commands so resume does not depend on remembering artifact shape by hand

The goal is simple: keep non-trivial work readable, resumable, and harder to derail.

Current skill contract:
- `qc-flow` owns clarification, affected-area discussion, context sufficiency, targeted research, delivery-roadmap planning, phase-local verified plans, serialized delegated checkpoints, and phase/wave closeout
- `qc-lock` owns narrow execution loops once the scope is understood, using a compact lock artifact with bridge fields for gate, phase, current step, verify path, blockers, verification evidence, and remaining requirements
- unresolved gray areas stop roadmap, plan, plan-check, and execution until they are resolved or explicitly moved out of scope
- project memory lives in `.quick-codex-flow/PROJECT-ROADMAP.md` and `.quick-codex-flow/BACKLOG.md`, while each active run stays anchored by `STATE.md`
- Experience Engine is optional; when present, hook warnings and route/model verdicts are persisted into the relevant run fields instead of becoming chat-only advice

Design rule:
- `single is good`: Quick Codex must still produce a safe protocol baseline with no external advisor
- `better together`: when Experience Engine is configured, the same checkpoint can also carry a guarded brain verdict that confirms or vetoes the baseline action

In practice, that means:
- resume from files instead of guessing from stale chat state
- keep one project-level roadmap and backlog so multi-run work does not collapse into isolated run files
- require `Delivery Roadmap` before phase-local planning or execution
- keep `Verified Plan` phase-local instead of pretending it is the whole roadmap
- use Codex's native planner as a short-lived progress mirror when it is available, without depending on it for continuity
- compact at safe checkpoints instead of waiting for context loss to happen at random
- carry forward only the next phase or wave actually needs instead of dragging the whole transcript forward
- surface blast radius before implementation pretends to be obvious
- force planning to rest on repo evidence or an explicit research-skip rationale
- treat unresolved gray areas as a hard stop for planning and execution
- force each unresolved gray area to produce at least 3 options, with one recommended option plus a free-text path for the operator
- treat delegated `research`, `plan-check`, and `goal-audit` checkpoints as blocking gates until their result is merged back into the run artifact
- keep discuss decisions, cross-phase dependencies, and goal-backward checks explicit enough to survive a clear session
- keep scope tight once execution starts
- make verification explicit so failures narrow the next move instead of causing thrash
- carry forward hook-derived constraints so compaction does not erase relevant Experience Engine warnings

## Why Quick Codex

Without a workflow layer:

```text
Turn 1: clarify a medium-sized task
Turn 2: research a few gaps
Turn 3: start implementation
Turn 6: context is crowded, the session compacts awkwardly, next step is unclear
```

With Quick Codex:

```text
Turn 1: create a run artifact with baseline, risks, and a checked plan
Turn 2: execute one wave or one locked step
Turn 3: checkpoint the wave and write a deliberate carry-forward handoff
Turn 6: resume from the artifact, not from whatever the session still remembers
```

Quick Codex is for teams and solo developers who want:
- stronger planning before coding
- explicit handoff from plan to execution
- bounded-context continuity across long tasks
- a cleaner way to resume after interruptions

It is especially useful when the pain point is:
- "Codex keeps losing the thread"
- "The context window is getting full and I do not want to drag the whole transcript into the next wave"
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
- [Carry-Forward Footprint](./BENCHMARK-PROOF-CARRY-FORWARD.md): shows a same-phase next-wave pack is materially smaller than the whole artifact while still passing handoff-sufficiency validation
- [Brain-Advised Session Action](./BENCHMARK-PROOF-BRAIN-SESSION-ACTION.md): shows the protocol works alone and becomes sharper when Experience Engine adds a guarded brain verdict for `/compact` or `/clear`

The benchmark index lives in [BENCHMARKS.md](./BENCHMARKS.md).

## Quick Start

This section describes the skill-first install path.

### Option A: Install from npm

```bash
npx quick-codex install
```

This installs:
- `qc-flow`
- `qc-lock`

into the canonical Codex user skills directory:

```text
~/.agents/skills
```

Legacy compatibility:

```text
~/.codex/skills
```

is still supported when you pass `--target ~/.codex/skills`, but it is no longer the default.

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
mkdir -p ~/.agents/skills
ln -s /path/to/repo/qc-flow ~/.agents/skills/qc-flow
ln -s /path/to/repo/qc-lock ~/.agents/skills/qc-lock
```

If you prefer copies instead of symlinks:

```bash
mkdir -p ~/.agents/skills
cp -R /path/to/repo/qc-flow ~/.agents/skills/
cp -R /path/to/repo/qc-lock ~/.agents/skills/
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
| **Project governance** | Run-level only unless the operator manages it manually | `PROJECT-ROADMAP.md` and `BACKLOG.md` keep milestone, backlog, and deferred-decision state durable |
| **Resume after interruption** | Easy to lose the thread | Resume from run file and `STATE.md` |
| **Roadmap discipline** | Plan often replaces roadmap | `Delivery Roadmap` must exist before phase-local planning or execution |
| **Gray areas** | Agent may guess and keep going | Hard stop until each gray area is cleared or explicitly deferred |
| **Context compaction** | Keep carrying transcript or lose continuity | Deliberate compaction with carry-forward cues |
| **Large-task handoff** | Often implicit | Explicit next gate, roadmap phase, and auto-continue command |
| **Execution control** | Can drift on medium tasks | `qc-lock` keeps the loop strict |
| **Recovery surface** | Reconstruct state manually | `status`, `resume`, `doctor-run`, and `doctor-flow` |
| **Deferred work memory** | Easy to forget after the current run ends | parking lot, deferred decisions, and future seeds stay in backlog artifacts |
| **Workflow surface** | Ad hoc per session | Reusable conventions |

## How It Works

```text
YOU start with a task
  │
  ├─ qc-flow
  │   └─ discuss
  │   └─ explore affected area / blast radius
  │   └─ research only missing pieces
  │   └─ clear Gray Area Register with explicit user choices
  │   └─ write Delivery Roadmap
  │   └─ write phase-local plan
  │   └─ run plan-check
  │   └─ execute the current roadmap phase
  │   └─ surface an auto-continue command, not only a paste-only prompt
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

Hard flow guarantees:
- unresolved gray areas block `roadmap`, `plan`, `plan-check`, and `execute`
- each unresolved gray area must produce at least 3 operator-facing options, with one recommended option and a free-text escape hatch
- `Delivery Roadmap` is mandatory before phase-local planning or execution; `Verified Plan` only covers the active roadmap phase
- `Discuss Register`, `Decision Register`, and `Dependency Register` keep the front-half and cross-phase reasoning durable
- `Delegation State` makes delegated `research`, `plan-check`, and `goal-audit` checkpoints blocking until their results are merged back into the run artifact
- `Goal-Backward Verification` keeps checkpoints honest about outcome closure instead of only local task completion
- `.quick-codex-flow/PROJECT-ROADMAP.md` and `.quick-codex-flow/BACKLOG.md` give the workflow a project-level memory for milestones, parked work, deferred decisions, and future seeds
- stale flow artifacts can be repaired forward so they gain `Workflow State`, `Gray Area Register`, and `Delivery Roadmap`

When the Codex build exposes a native planner or progress-list UI, Quick Codex should use it as a visible mirror of the current gate, active phase or wave, and the current checkpoint action family.
At a phase checkpoint, that means the planner should make `compact`, `clear`, or `relock` visible instead of leaving it buried only in the artifact.
That planner is intentionally ephemeral.
The run artifact remains the source of truth for resume, risk, experience, proof, and handoff.

Quick Codex is not trying to be a project operating system. It is trying to solve a smaller Codex CLI problem set well:
- task durability when work spans multiple turns
- reliable resume after interruption or stale session state
- proactive compaction at safe checkpoints when carrying the whole transcript forward is wasteful

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

`qc-lock` is allowed to run standalone only after its preflight proves the execution target, affected area, protected boundaries, and verify path. When it follows a `qc-flow` handoff, keep the lock artifact compact and carry only the bridge fields needed for execution instead of copying broad flow summaries.

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
quick-codex project-status [--dir <project-dir>]
quick-codex sync-project [--dir <project-dir>] [--run <path>]
quick-codex delegate-research [--dir <project-dir>] [--run <path>] [--question <text>] [--scope <text>]
quick-codex delegate-plan-check [--dir <project-dir>] [--run <path>] [--focus <text>] [--scope <text>]
quick-codex delegate-goal-audit [--dir <project-dir>] [--run <path>] [--focus <text>] [--scope <text>]
quick-codex complete-delegation [--dir <project-dir>] [--run <path>] --type <research|plan-check|goal-audit> [--status <completed|blocked>] [--summary <text>] [--verdict <text>] [--recommended-transition <text>]
quick-codex capture-hooks [--dir <project-dir>] [--run <path>] [--input <path>]
quick-codex sync-experience [--dir <project-dir>] [--run <path>] --tool <name> [--tool-input <json>] [--tool-input-file <path>] [--engine-url <url>] [--timeout-ms <ms>]
quick-codex checkpoint-digest [--dir <project-dir>] [--run <path>]
quick-codex snapshot [--dir <project-dir>] [--run <path>]
quick-codex repair-run [--dir <project-dir>] [--run <path>]
quick-codex doctor-run [--dir <project-dir>] [--run <path>]
quick-codex doctor-flow [--dir <project-dir>] [--run <path>]
quick-codex doctor-project [--dir <project-dir>]
quick-codex lock-check [--dir <project-dir>] [--run <path>]
quick-codex verify-wave [--dir <project-dir>] [--run <path>] [--phase <id>] [--wave <id>] [--allow-shell-verify]
quick-codex regression-check [--dir <project-dir>] [--run <path>] [--phase <id>] [--wave <id>] [--allow-shell-verify]
quick-codex close-wave [--dir <project-dir>] [--run <path>] [--phase <id>] [--wave <id>] [--phase-done]
quick-codex upgrade [--copy] [--target <dir>]
quick-codex uninstall [--target <dir>] [--dir <project-dir>]
```

Recommended usage:
- `install` installs `qc-flow` and `qc-lock` into `~/.agents/skills` by default
- `install` and `upgrade` remove duplicate `quick-codex` installs from the alternate discovery root when the target is a real Codex discovery root, so Codex does not autocomplete the same skill twice
- `doctor` validates package shape, installed skills, and lint status across supported discovery targets unless `--target` is passed
- `init` scaffolds `AGENTS.md`, `.quick-codex-flow/`, `STATE.md`, `PROJECT-ROADMAP.md`, `BACKLOG.md`, and a sample run artifact with an optional `Active lock` pointer
- `status` shows the active continuity artifact, gate, risks, roadmap phase, unresolved gray areas, and preferred auto-continue commands for flow runs
- `resume` prints the exact next prompt(s) to paste when resuming, plus the active carry-forward cues (`Phase relation`, `What to forget`, `What must remain loaded`), preferred auto-continue commands, and any experience constraints that still matter
- `project-status` shows milestone rows, active run register, cross-run dependency count, and backlog/deferred/future-seed counts
- `sync-project` syncs the active flow run into the project-level roadmap register so milestone state survives outside the run file
- `delegate-research`, `delegate-plan-check`, and `delegate-goal-audit` assign serialized blocking checkpoints for role-split work without relying on background orchestration
- `complete-delegation` records the delegated worker result back into the run artifact so CLI and wrapper surfaces can continue safely
- `capture-hooks` parses hook text from a file or stdin and syncs it into `Experience Snapshot`
- `sync-experience` calls Experience Engine `/api/intercept` for a concrete tool action and syncs returned warnings into `Experience Snapshot`
- `checkpoint-digest` prints a resume card plus deliberate-compaction cues so the keep/drop carry-forward state is visible at a glance
- `checkpoint-digest` now also surfaces `Baseline action`, `Brain verdict`, and `Explicit suggested action`, plus the same-phase `Next Wave Pack` when it exists
- `snapshot` is a shorter alias for `checkpoint-digest`
- `repair-run` backfills flow-run resumability sections, including `Workflow State`, `Gray Area Register`, `Delivery Roadmap`, and `Wave Handoff`, preserves compact lock artifacts, and realigns `STATE.md` for flow or lock handoff
- `doctor-run` validates a flow run or lock artifact against the continuity contract, including workflow-state and delivery-roadmap checks plus a scored handoff-sufficiency check for flow runs, and checks the `STATE.md` handoff
- `doctor-flow` validates flow-only workflow rules such as `Workflow State`, `Delegation State`, `Gray Area Register`, `Delivery Roadmap`, current roadmap phase, delegated checkpoint discipline, and gray-area discipline before roadmap/plan/execute
- `doctor-project` validates project-level roadmap and backlog scaffolds so milestone/backlog state does not silently rot
- `lock-check` validates that a flow or lock artifact is explicit enough for locked execution before handing work to a narrow executor
- `verify-wave` runs the active wave verify commands from the artifact and appends bounded evidence into `Verification Ledger`
- `regression-check` reruns the active protected-boundary verification commands, preferring the current wave, then `Latest Phase Close -> Verification completed`, and only falling back to `Next verify` when no broader command source exists
- verification commands run without a shell by default; shell syntax such as redirection, pipelines, leading env assignment, or subshells requires `--allow-shell-verify` or `QUICK_CODEX_ALLOW_SHELL_VERIFY=1`
- `close-wave` marks the active verified wave done, refreshes the summaries, auto-routes to the next same-phase wave when `Verified Plan -> Waves` already defines it, can write `Latest Phase Close` when `--phase-done` is passed, and closes the feature into `Latest Feature Close` plus `Current gate: done` when the roadmap has no later planned phase
- `upgrade` reruns install behavior and removes legacy skill names if present
- `uninstall` removes installed skills from the target path and can also remove project scaffolds when `--dir` is provided explicitly
- the CLI prints a short update notice when npm has a newer published version

Migration notes for older artifacts:
- older `qc-flow` runs can be repaired forward with `repair-run`
- repaired `qc-flow` runs now gain `Project Alignment`, `Workflow State`, `Discuss Register`, `Decision Register`, `Dependency Register`, `Gray Area Register`, `Delivery Roadmap`, `Delegation State`, `Goal-Backward Verification`, `Wave Handoff`, the compact keep/drop fields (`Phase relation`, `Carry-forward invariants`, `What to forget`, `What must remain loaded`), and optional brain verdict fields
- same-phase auto-routing can also emit a narrow `Next Wave Pack` so the next wave does not need the whole execution-wave narrative to resume safely
- canonical `qc-lock` artifacts should keep their bridge fields inside `## Locked Plan`
- older `qc-lock` artifacts may still use legacy `## Current Locked Plan`, but they should gain bridge fields incrementally: `Current gate`, `Current verify`, `Recommended next command`, `Blockers`, `Verification evidence`, and `Requirements still satisfied`
- if you previously installed to both `~/.agents/skills` and `~/.codex/skills`, rerun `install` or `upgrade` once to remove the duplicate discovery entry
- do not copy `Resume Digest` or `Compact-Safe Summary` into `qc-lock`; keep the lock artifact compact

Minimum smoke-check path for continuity adoption:
- `bash scripts/lint-skills.sh`
- `node bin/quick-codex.js status --dir /path/to/project --run .quick-codex-flow/<run>.md`
- confirm `status` exposes roadmap phase, unresolved gray areas, and a preferred auto-continue command
- `node bin/quick-codex.js project-status --dir /path/to/project`
- `node bin/quick-codex.js doctor-run --dir /path/to/project --run .quick-codex-flow/<run>.md`
- `node bin/quick-codex.js doctor-flow --dir /path/to/project --run .quick-codex-flow/<run>.md`
- `node bin/quick-codex.js doctor-project --dir /path/to/project`
- `node bin/quick-codex.js lock-check --dir /path/to/project --run .quick-codex-flow/<run>.md`
- `node bin/quick-codex.js verify-wave --dir /path/to/project --run .quick-codex-flow/<run>.md --phase Pn --wave Wn`
- `node bin/quick-codex.js regression-check --dir /path/to/project --run .quick-codex-flow/<run>.md --phase Pn --wave Wn`
- if a verify command depends on shell syntax, rerun with `--allow-shell-verify` only after you trust the artifact content
- `node bin/quick-codex.js close-wave --dir /path/to/project --run .quick-codex-flow/<run>.md --phase Pn --wave Wn`
- confirm the flow run now carries both `Compact-Safe Summary` and `Wave Handoff`; phase-close checkpoints should classify `Phase Relation`
- `node bin/quick-codex.js status --dir /path/to/project --run .quick-codex-lock/<task>.md`
- `node bin/quick-codex.js doctor-run --dir /path/to/project --run .quick-codex-lock/<task>.md`
- if `STATE.md` uses `Active lock`, confirm plain `status` and `resume` without `--run` resolve to the lock artifact

You can also run the CLI directly:

```bash
node bin/quick-codex.js doctor
node bin/quick-codex.js init --dir /path/to/project
node bin/quick-codex.js status --dir /path/to/project
node bin/quick-codex.js resume --dir /path/to/project
node bin/quick-codex.js project-status --dir /path/to/project
node bin/quick-codex.js sync-project --dir /path/to/project --run .quick-codex-flow/<run>.md
node bin/quick-codex.js capture-hooks --dir /path/to/project --input /path/to/hooks.txt
node bin/quick-codex.js sync-experience --dir /path/to/project --tool Write --tool-input '{"file_path":"src/app.ts"}'
node bin/quick-codex.js checkpoint-digest --dir /path/to/project
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
node bin/quick-codex.js doctor-flow --dir /path/to/project
node bin/quick-codex.js doctor-project --dir /path/to/project
node bin/quick-codex.js lock-check --dir /path/to/project --run .quick-codex-flow/<run>.md
node bin/quick-codex.js verify-wave --dir /path/to/project --run .quick-codex-flow/<run>.md --phase Pn --wave Wn
node bin/quick-codex.js regression-check --dir /path/to/project --run .quick-codex-flow/<run>.md --phase Pn --wave Wn
# add --allow-shell-verify only when the artifact verify command truly needs shell syntax
node bin/quick-codex.js close-wave --dir /path/to/project --run .quick-codex-flow/<run>.md --phase Pn --wave Wn
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

Recommended division of responsibility:
- Quick Codex owns the protocol baseline: `Phase Relation`, `Compaction action`, and the final safety guardrails
- Experience Engine owns the advisor layer: hook warnings, optional brain verdict, and upstream model-choice or cost-routing verdicts
- Quick Codex does not hardcode one SiliconFlow model; it consumes the verdict returned by Experience Engine and falls back cleanly when that advisor is unavailable

For the authoritative field ownership and surface roles behind resume, lock, and scaffold behavior, see [CONTINUITY-CONTRACT.md](./CONTINUITY-CONTRACT.md).

Recommended routing for relevant hook warnings:
- `Clarify State` -> scope, constraints, open questions
- `Clarify State` -> affected area, protected boundaries, user-confirmed assumptions
- `Research Pack` -> evidence, answered questions, unresolved risks
- `Execution Wave` -> `Risks`, `Invariant requirements`, `Verify`
- `Phase Close` -> carry-forward notes, open risks
- `Phase Close` -> `Phase Relation`, sealed decisions, carry-forward invariants, expired context
- `Phase Relation` -> compaction action: `same-phase` => `compact`, `dependent-next-phase` => downstream-only `compact`, `independent-next-phase` => `clear`, `relock-before-next-phase` => `relock`
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
- `Compact-Safe Summary` -> `Phase relation`, `Compaction action`, optional brain verdict fields, `Carry-forward invariants`, `What to forget`, `What must remain loaded`
- `Wave Handoff` -> trigger, source checkpoint, next target, optional brain verdict fields, sealed decisions, keep/drop carry-forward payload
- `Next Wave Pack` -> same-phase-only execution packet: target, next verify, carry-forward invariants, and resume payload

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
- `lock-check` says the artifact is not lock-ready:
  - make the affected area, exclusions, evidence basis, and verify path explicit in the active artifact
  - remove or resolve any active gray-area trigger before handing work to a locked executor
- `verify-wave` or `regression-check` cannot find verify commands:
  - add `Verify:` bullets to `Current Execution Wave`
  - or record broader protected-boundary commands in `Latest Phase Close -> Verification completed`
  - or set `Next verify` explicitly if you want the last-resort fallback behavior
- `close-wave` refuses to close the wave:
  - run `verify-wave` or otherwise record at least one passing `Verification Ledger` entry for the same phase/wave first
  - clear any failing ledger entry for that same phase/wave before retrying
- `close-wave` does not route to the next wave automatically:
  - make sure the run already has a `## Waves` table under `Verified Plan`
  - only same-phase `pending` waves are auto-routed; otherwise the command keeps the generic `qc-flow` handoff
- `npx --yes ./quick-codex install` fails:
  - run `node bin/quick-codex.js install` from inside `quick-codex/`
- `npx` fails because npm cache is not writable:
  - run `npm_config_cache=/tmp/quick-codex-npm-cache npx quick-codex install`
  - or `npm_config_cache=/tmp/quick-codex-npm-cache npx --yes ./quick-codex install`
- Codex does not see the skills:
  - check `~/.agents/skills`
  - if you intentionally use the legacy path, rerun with `--target ~/.codex/skills`
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
- You want to fully remove the package from a project as well as the default `~/.agents/skills` install:
  - run `node bin/quick-codex.js uninstall --dir /path/to/project`
  - `AGENTS.md` is only removed if it exactly matches the quick-codex scaffold
