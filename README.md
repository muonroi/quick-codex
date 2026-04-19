<p align="center">
  <h1 align="center">Quick Codex</h1>
  <p align="center">
    <strong>A bounded-context workflow layer for Codex CLI: resume cleanly, compact deliberately, and keep medium-sized work from drifting.</strong>
  </p>
  <p align="center">
    <a href="#wrapper-first-quick-start">Wrapper-First Quick Start</a> ·
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
- `quick-codex-wrap` for thin frontdoor task routing plus wrapper-driven session orchestration from `qc-flow` artifacts
- local recovery commands so resume does not depend on remembering artifact shape by hand

The goal is simple: keep non-trivial work readable, resumable, and harder to derail.

Design rule:
- `single is good`: Quick Codex must still produce a safe protocol baseline with no external advisor
- `better together`: when Experience Engine is configured, the same checkpoint can also carry a guarded brain verdict that confirms or vetoes the baseline action

In practice, that means:
- resume from files instead of guessing from stale chat state
- use Codex's native planner as a short-lived progress mirror when it is available, without depending on it for continuity
- compact at safe checkpoints instead of waiting for context loss to happen at random
- carry forward only the next phase or wave actually needs instead of dragging the whole transcript forward
- surface blast radius before implementation pretends to be obvious
- force planning to rest on repo evidence or an explicit research-skip rationale
- treat unresolved gray areas as a hard stop for fast-path and premature execution lock
- keep scope tight once execution starts
- make verification explicit so failures narrow the next move instead of causing thrash
- carry forward hook-derived constraints so compaction does not erase relevant Experience Engine warnings

## Wrapper-First Quick Start

If you only read one section, read this one.

Quick Codex is now best treated as a thin wrapper in front of Codex CLI:
- bare `codex` stays on the real native Codex CLI
- `codex --qc-ui` opens the Electron host as the main Quick Codex frontdoor
- `codex "some task"` becomes a one-shot wrapper launch
- wrapper task routing can choose `qc-flow`, `qc-lock`, or `direct`
- wrapper continuity can auto-drive `compact`, `clear`, `resume`, and follow-loop behavior
- legacy wrapper chat renderers remain available only as deprecated fallback/debug surfaces
- Experience Engine stays optional; wrapper falls back cleanly when the brain is unavailable

### 1. Install the package and wrapper surface

Important:
- installing the npm package alone does not hijack `codex`
- `codex` only becomes wrapper-first after you install the shim with `quick-codex install-codex-shim --force`
- the shim must live on a directory that appears before the real `codex` binary in `PATH`

Global npm install:

```bash
npm install -g quick-codex
quick-codex install
quick-codex install-codex-shim --force
```

One-shot npm usage without a global install:

```bash
npx quick-codex install
npx quick-codex install-codex-shim --force
```

From a local checkout:

```bash
node bin/quick-codex.js install
node bin/quick-codex.js install-codex-shim --force
```

Restart Codex after the install step if your runtime caches command discovery.

### 2. What changes after the shim is installed

Before installing the shim:

```bash
codex
```

starts the raw Codex CLI.

After installing the shim:

```bash
codex
```

still opens the real native Codex CLI by default.

Other important command paths:

```bash
codex --qc-ui
codex "fix the wrapper follow loop"
codex --qc-help
codex --qc-bypass
```

- `codex "..."` runs the default wrapper one-shot path
- `codex --qc-ui` opens the Electron host, which embeds the native Codex TUI behind the Quick Codex boundary
- `quick-codex-wrap chat --ui native --native-guarded-slash /status` runs the first guarded proof-path native slash injection on top of observer/controller signals
- `quick-codex-wrap chat --ui native --native-guarded-slash /compact` now proves the first continuity-driving native slash path on the same controller boundary
- `quick-codex-wrap chat --ui native --native-guarded-slash /clear` now proves the next continuity-driving native slash path on the same controller boundary
- `codex --qc-help` prints the wrapper shim surface
- `codex --qc-bypass` skips the thin wrapper and launches raw Codex behavior

### 2.1 Electron host

If you want the Quick Codex frontdoor with native Codex UI preserved, use the external Electron host repo/package `muonroi/quick-codex-electron`, install `@quick-codex/qc-electron`, or point the shim at a host launcher through `QUICK_CODEX_ELECTRON_HOST_BIN`.

```bash
git clone https://github.com/muonroi/quick-codex-electron.git
cd quick-codex-electron
npm install
npm run dev
```

Headless / CI (Linux without a display):

```bash
npm run dev:xvfb
npm run smoke:xvfb
```

Surface:
- `native codex + qc auto`: the host keeps native Codex visible in the transcript while Quick Codex handles route, protocol, and continuity around it
- legacy `orchestrated` seams still exist internally for tests and migration safety, but they are not part of the public UI anymore

Electron host control commands (handled locally in the host, not by Codex):
- `/qc help`
- `/qc start` / `/qc stop`
- `/qc dir <path>`
- `/qc turns <n>`

Native parity status:
- the current parity matrix lives in the external Electron host repo as `NATIVE_PARITY.md`
- Electron host already proves session reuse, model/reasoning-driven restart, slash forwarding, raw passthrough writes, resize forwarding, and clean xvfb smoke boot
- Electron host still needs manual/e2e proof for full native autocomplete, menu/modal parity as rendered inside Electron, copy/paste + multiline ergonomics, and scrollback ergonomics

### 3. What the wrapper is doing for you

Route selection now has three safety layers:
- brain route when Experience Engine is alive
- heuristic route when the brain is unavailable
- manual override when the operator wants to force a route

Manual route override examples:

```bash
codex --qc-force-flow --qc-task "research the repo and plan the work" --qc-json
codex --qc-force-lock --qc-task "fix one narrow bug in README.md" --qc-json
codex --qc-force-direct --qc-task "explain the wrapper architecture" --qc-json
```

Inside the interactive wrapper shell:

```text
/route auto
/route flow
/route lock
/route direct
```

### 4. The two most useful day-one commands

Interactive session:

```bash
codex --qc-ui
```

One-shot task:

```bash
codex "fix quick-codex-wrap in bin/quick-codex-wrap.js so one command handles a narrow CLI bug"
```

If you want the raw skill-first flow instead of the wrapper-first surface, the classic entrypoints still work:

```text
Use $qc-flow for this task: ...
Use $qc-lock for this task: ...
```

### 5. Rollout checklist for a new machine

```bash
npm install -g quick-codex
quick-codex install
quick-codex install-codex-shim --force
codex --qc-help
codex
```

Expected result:
- `codex --qc-help` prints the shim help instead of raw Codex help
- bare `codex` stays on native Codex
- `codex --qc-ui` opens the Electron host
- `codex "some task"` goes through wrapper routing
- `codex --qc-bypass` still opens raw Codex behavior when needed

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

This section describes the lower-level install paths and the older skill-first entrypoints.
If you want the current recommended surface, start from [Wrapper-First Quick Start](#wrapper-first-quick-start).

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
| **Resume after interruption** | Easy to lose the thread | Resume from run file and `STATE.md` |
| **Context compaction** | Keep carrying transcript or lose continuity | Deliberate compaction with carry-forward cues |
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

When the Codex build exposes a native planner or progress-list UI, Quick Codex should use it as a visible mirror of the current gate, active phase or wave, and the current checkpoint action family.
At a phase checkpoint, that means the planner should make `compact`, `clear`, or `relock` visible instead of leaving it buried only in the artifact.
That planner is intentionally ephemeral.
The run artifact remains the source of truth for resume, risk, experience, proof, and handoff.

Quick Codex is not trying to be a project operating system. It is trying to solve a smaller Codex CLI problem set well:
- task durability when work spans multiple turns
- reliable resume after interruption or stale session state
- proactive compaction at safe checkpoints when carrying the whole transcript forward is wasteful

## Wrapper Frontdoor MVP

Quick Codex now includes an early thin-wrapper scaffold:

```bash
node bin/quick-codex-wrap.js prompt --task "explain how wrapper-state works" --json
node bin/quick-codex-wrap.js run --task "fix quick-codex-wrap in bin/quick-codex-wrap.js" --dry-run --json
node bin/quick-codex-wrap.js chat --dir /path/to/project
node bin/quick-codex-wrap.js auto --task "continue the active wrapper work and explain the next step" --json
node bin/quick-codex-wrap.js auto --run .quick-codex-flow/sample.md --follow --max-turns 3 --json
node bin/quick-codex.js install-codex-shim --force
codex
codex "fix the wrapper follow loop"
codex --qc-chat --qc-dir /path/to/project
codex --qc-full --qc-autonomous --qc-task "run end-to-end in this repo" --qc-json
codex --qc-readonly --qc-manual --qc-task "inspect and explain this repo" --qc-json
codex --qc-auto --task "continue the active wrapper work and explain the next step" --json
codex --qc-auto --run .quick-codex-flow/sample.md --follow --max-turns 3 --json
codex --qc-auto --qc-task "continue the active wrapper work and explain the next step" --qc-json
codex --qc-auto --qc-dir /path/to/project --qc-run-file .quick-codex-flow/sample.md --qc-follow --qc-max-turns 3 --qc-json
codex --qc-fast --qc-task "fix a narrow bug in one file" --qc-json
codex --qc-safe --qc-task "continue the active wrapper work" --qc-json
codex --qc-follow-safe --qc-dir /path/to/project --qc-run-file .quick-codex-flow/sample.md --qc-json
codex --qc-force-flow --qc-task "research the repo and plan the work" --qc-json
codex --qc-force-lock --qc-task "fix one narrow bug in README.md" --qc-json
codex --qc-force-direct --qc-task "explain the wrapper architecture" --qc-json
codex --qc-help
codex --qc-bypass
node bin/quick-codex-wrap.js decide --dir /path/to/project --run .quick-codex-flow/<run>.md
node bin/quick-codex-wrap.js start --dir /path/to/project --run .quick-codex-flow/<run>.md --dry-run --json
```

The wrapper:
- can classify a raw task into `qc-flow`, `qc-lock`, or a direct prompt path
- can ask Experience Engine to route the raw task first through `POST /api/route-task`, sending task text plus active-run context before falling back to local heuristics
- task routing now folds Unicode text before local heuristic matching, so Vietnamese prompts such as `sửa lỗi chính tả trong README.md` or `giải thích kiến trúc hiện tại của wrapper` route more safely even when the brain endpoint is slow or unavailable
- can also accept explicit manual route overrides, so `codex --qc-force-flow`, `codex --qc-force-lock`, `codex --qc-force-direct`, or shell `/route ...` bypass both brain and heuristic routing when the user wants to force the route
- can prefer a suitable non-done active run artifact over a generic raw-task prompt when the incoming task is really a continuation
- can expose a unified `auto` entrypoint that orchestrates either raw-task routing or artifact-driven continuation
- can optionally `auto --follow` so the wrapper rereads the flow artifact after each turn and auto-launches the next turn only when a real checkpoint advances
- `auto --follow` preserves the artifact's native session boundary when possible, so same-phase checkpoints with a saved thread default to `thread/compact/start` instead of an implicit resume
- `auto --follow` keeps a persistent `codex app-server` process alive across compact/clear/resume turns, so native thread orchestration can chain multiple checkpoints without respawning the app-server process between turns
- `chat` still exists as a legacy wrapper shell for fallback/debug, but it is no longer the recommended frontdoor
- wrapper launch policy is now resolved centrally and passed down to both `codex exec` and native `codex app-server`
- when Experience Engine model routing is enabled, wrapper launch paths also pass through the returned `reasoningEffort` as `-c model_reasoning_effort="..."`, so Codex model selection and reasoning level stay aligned
- auto-bootstraps the standard Quick Codex scaffold before the first broad `qc-flow` raw-task launch when `.quick-codex-flow/STATE.md` is missing
- compiles the wrapper-selected Quick Codex prompt before launch
- reads the run artifact directly instead of scraping human-oriented digest output
- chooses a fresh-session path by default
- can optionally resume the last wrapper-tracked native thread or `codex exec` session when `--same-session` is explicitly provided
- can drive `clear-session` with native `codex app-server -> thread/start(clear)`, `resume-session` with native `thread/resume`, and `compact-session` with native `thread/compact/start` when a saved thread id exists
- can install a `codex`-compatible shim via `quick-codex install-codex-shim`, so `codex --qc-auto`, `codex --qc-run`, `codex --qc-prompt`, and related `--qc-*` flags route into the wrapper
- the shim can now treat a plain prompt such as `codex "fix the wrapper follow loop"` as the default wrapper entrypoint, using the follow-safe profile automatically
- bare `codex` now stays on the real native Codex CLI by default
- `codex --qc-ui` is the recommended GUI frontdoor for Quick Codex automation on top of native Codex
- `codex --qc-chat` opens the wrapper shell explicitly when you want to stay on the `--qc-*` surface
- `codex --qc-bypass ...` is the explicit escape hatch for raw Codex behavior
- repo-level defaults are supported in `.quick-codex-flow/wrapper-config.json`
- can expose wrapper options through a qc-profile shim surface, so users can stay on `codex --qc-*` without mixing in raw wrapper flags such as `--task` or `--follow`
- can expose preset qc profiles, so users can ask for `fast`, `safe`, or `follow-safe` behavior without spelling the command policy out every time
- can expose explicit permission overlays and approval modes on the shim:
  - `--qc-full`, `--qc-yolo`, `--qc-readonly`
  - `--qc-manual`, `--qc-autonomous`, `--qc-untrusted`
- qc-only overlay flags now default into the wrapper too, so `codex --qc-full --qc-task "..."` routes to wrapper auto mode even without spelling `--qc-auto`
- can print local shim help with `codex --qc-help`, so the full `--qc-*` surface is discoverable from the terminal without opening docs
- can autocomplete shell slash commands such as `/perm` and `/approval`
- can also drive the interactive shell through explicit slash commands such as `/task`, `/follow`, and `/turns`, so the shell feels closer to a small command console than plain free text
- when Experience Engine returns `needs_disambiguation`, the interactive shell now shows a numbered choice menu plus a free-text escape path instead of silently guessing
- translates continuity metadata into machine-usable session fields such as `sessionStrategy`, `handoffAction`, `nativeThreadAction`, and `chatActionEquivalent`
- exposes follow-loop stop reasons such as `completed`, `blocker`, `relock`, `ask-user`, `no-checkpoint-progress`, and `max-turns-reached`
- stores wrapper-local state in `.quick-codex-flow/wrapper-state.json`, including the last native thread id plus the latest routed model verdict when Experience Engine model routing is active

Repo-level wrapper defaults live in `.quick-codex-flow/wrapper-config.json`:

```json
{
  "version": 1,
  "defaults": {
    "permissionProfile": "safe",
    "approvalMode": null,
    "executionProfile": "follow-safe",
    "chat": {
      "follow": true,
      "maxTurns": 5,
      "uiRenderer": "auto"
    }
  }
}
```

Interactive wrapper shell quick reference:
- `/task <text>` submits a task explicitly through the wrapper
- `/perm <safe|full|yolo|readonly>` switches permission policy
- `/route <auto|flow|lock|direct>` switches between automatic routing and hard manual route overrides
- `/approval <manual|autonomous|untrusted>` switches approval behavior
- `/mode <fast|safe|follow-safe>` changes execution profile
- `/follow <on|off>` toggles auto-follow chaining
- `/turns <n>` changes the max follow-loop depth
- `Tab` completes supported slash commands and profile values

The current scope is still thin:
- task routing is heuristic, not magical
- route selection now has three safety layers: Experience Engine when available, local heuristic fallback when the brain is unavailable, and explicit user override when the route must be forced manually
- active-run preference is also heuristic and currently keys off active state, continuation intent, and light task/artifact overlap
- bootstrap sample artifacts such as `.quick-codex-flow/sample-run.md` are excluded from auto-resume preference so a fresh scaffold does not hijack later raw tasks
- auto-bootstrap only prepares the standard scaffold; Codex still owns the real task-specific run artifact after launch
- wrapper control happens at the prompt and session boundary, not through hidden Codex mode toggles
- native `clear-session`, `resume-session`, and `compact-session` now use `codex app-server` when the wrapper has a saved thread id; older wrapper state without a thread id still falls back to legacy behavior
- artifact-driven continuation remains the authoritative path once a real run exists
- `auto --follow` currently depends on flow-artifact checkpoint changes; lock-artifact follow automation is still a future slice
- the interactive wrapper shell is line-oriented and intentionally simpler than the stock Codex TUI; it is now a deprecated fallback/debug surface rather than the main operator experience
- repo-level wrapper config is file-based today; there is not yet a separate editor command for mutating it outside `init` or manual edits
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
- `init` scaffolds `AGENTS.md`, `.quick-codex-flow/`, `STATE.md`, and a sample run artifact with an optional `Active lock` pointer
- `status` shows the active continuity artifact, gate, risks, and next verify for either a flow run or a lock artifact
- `resume` prints the exact next prompt(s) to paste when resuming, plus the active carry-forward cues (`Phase relation`, `What to forget`, `What must remain loaded`) and any experience constraints that still matter
- `capture-hooks` parses hook text from a file or stdin and syncs it into `Experience Snapshot`
- `sync-experience` calls Experience Engine `/api/intercept` for a concrete tool action and syncs returned warnings into `Experience Snapshot`
- `checkpoint-digest` prints a resume card plus deliberate-compaction cues so the keep/drop carry-forward state is visible at a glance
- `checkpoint-digest` now also surfaces `Baseline action`, `Brain verdict`, and `Explicit suggested action`, plus the same-phase `Next Wave Pack` when it exists
- `snapshot` is a shorter alias for `checkpoint-digest`
- `repair-run` backfills flow-run resumability sections, including `Wave Handoff`, preserves compact lock artifacts, and realigns `STATE.md` for flow or lock handoff
- `doctor-run` validates a flow run or lock artifact against the continuity contract, including a scored handoff-sufficiency check for flow runs, and checks the `STATE.md` handoff
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
- repaired `qc-flow` runs now gain `Wave Handoff`, the compact keep/drop fields (`Phase relation`, `Carry-forward invariants`, `What to forget`, `What must remain loaded`), and optional brain verdict fields
- same-phase auto-routing can also emit a narrow `Next Wave Pack` so the next wave does not need the whole execution-wave narrative to resume safely
- canonical `qc-lock` artifacts should keep their bridge fields inside `## Locked Plan`
- older `qc-lock` artifacts may still use legacy `## Current Locked Plan`, but they should gain bridge fields incrementally: `Current gate`, `Current verify`, `Recommended next command`, `Blockers`, `Verification evidence`, and `Requirements still satisfied`
- if you previously installed to both `~/.agents/skills` and `~/.codex/skills`, rerun `install` or `upgrade` once to remove the duplicate discovery entry
- do not copy `Resume Digest` or `Compact-Safe Summary` into `qc-lock`; keep the lock artifact compact

Minimum smoke-check path for continuity adoption:
- `bash scripts/lint-skills.sh`
- `node bin/quick-codex.js status --dir /path/to/project --run .quick-codex-flow/<run>.md`
- `node bin/quick-codex.js doctor-run --dir /path/to/project --run .quick-codex-flow/<run>.md`
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
node bin/quick-codex.js capture-hooks --dir /path/to/project --input /path/to/hooks.txt
node bin/quick-codex.js sync-experience --dir /path/to/project --tool Write --tool-input '{"file_path":"src/app.ts"}'
node bin/quick-codex.js checkpoint-digest --dir /path/to/project
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
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
- `quick-codex-wrap` now consumes `POST /api/route-model` for Codex launches, forwards the returned `model` to `codex exec` or `codex app-server`, and posts `POST /api/route-feedback` after executed turns
- `quick-codex-wrap` can also consume `POST /api/route-task` for raw task routing, using returned `route / confidence / needs_disambiguation / options` when available and falling back to the local heuristic router when the brain endpoint is absent or unavailable
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
