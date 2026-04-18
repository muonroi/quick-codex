# Quick Start

Recommended current surface: install the shim and use Quick Codex as a thin wrapper in front of `codex`.

```bash
npx quick-codex install
npx quick-codex install-codex-shim --force
codex
```

Important:
- installing `quick-codex` alone does not change the behavior of `codex`
- `codex` only becomes wrapper-first after `install-codex-shim --force`
- if `codex --qc-help` does not show the shim help text, your `PATH` is still resolving the real Codex binary first

After the shim is installed:
- bare `codex` opens the interactive wrapper shell
- `codex "some task"` becomes a one-shot wrapper launch
- real TTY terminals default to the richer Ink-based TUI
- non-TTY, CI, and `--json` sessions automatically fall back to the plain shell
- `codex --qc-ui plain` forces the plain shell when you do not want the richer TUI
- `codex --qc-ui native` launches the experimental stock-Codex bridge instead of the wrapper-owned shell
- `quick-codex-wrap chat --ui native --native-guarded-slash /status` is the first guarded native proof-path smoke
- `quick-codex-wrap chat --ui native --native-guarded-slash /compact` is the first guarded continuity-command smoke
- `quick-codex-wrap chat --ui native --native-guarded-slash /clear` is the next guarded continuity-command smoke
- the native bridge keeps the stock Codex TUI and now exposes internal observer/controller primitives for future automation work, but it does not yet auto-inject slash commands
- `codex --qc-bypass` is the escape hatch for raw Codex behavior

Minimal rollout check:

```bash
codex --qc-help
codex
codex --qc-ui plain
codex --qc-ui native
codex --qc-ui native --qc-native-guarded-slash /status
codex --qc-ui native --qc-native-guarded-slash /compact
codex --qc-ui native --qc-native-guarded-slash /clear
quick-codex-wrap chat --ui native --native-guarded-slash /status
quick-codex-wrap chat --ui native --native-guarded-slash /compact
quick-codex-wrap chat --ui native --native-guarded-slash /clear
```

The rest of this file covers the lower-level install and workflow details.

## 1. Install the skills

Fastest install from npm:

```bash
npx quick-codex install
```

If you previously installed the skills in both `~/.agents/skills` and legacy `~/.codex/skills`, rerunning `install` or `upgrade` against a discovery root now removes the duplicate discovery entry automatically.

Fastest local command:

```bash
npx --yes ./quick-codex install
```

From inside the package root:

```bash
node bin/quick-codex.js install
```

Use symlinks during development:

```bash
mkdir -p ~/.agents/skills
ln -s /path/to/repo/qc-flow ~/.agents/skills/qc-flow
ln -s /path/to/repo/qc-lock ~/.agents/skills/qc-lock
```

Or copy them:

```bash
mkdir -p ~/.agents/skills
cp -R /path/to/repo/qc-flow ~/.agents/skills/
cp -R /path/to/repo/qc-lock ~/.agents/skills/
```

Legacy compatibility path:

```bash
node bin/quick-codex.js install --target ~/.codex/skills
```

Restart Codex after installation.

Or run:

```bash
bash scripts/install.sh
```

Verify the package:

```bash
node bin/quick-codex.js doctor
```

If npm has a newer published version, the CLI prints a short upgrade notice and points to:

```bash
npx quick-codex@latest upgrade
```

Initialize a project for run artifacts, state discovery, and prompts:

```bash
node bin/quick-codex.js init --dir /path/to/project
```

Check what the package thinks is active:

```bash
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
node bin/quick-codex.js close-wave --dir /path/to/project --run .quick-codex-flow/<run>.md --phase Pn --wave Wn
```

Verification trust boundary:
- `verify-wave` and `regression-check` execute artifact commands without a shell by default
- shell features such as `>`, `|`, `&&`, leading `FOO=bar`, or subshell syntax require `--allow-shell-verify`
- only opt in when you trust the run artifact content and the shell syntax is actually required

## 2. Start from the pain point, not the theory

If Codex is losing the thread on a medium task:

```text
Use $qc-flow for this task: <describe the task>. Keep a persistent run artifact and do not rely on chat memory.
```

If the task tends to drift or reopen scope:
- clarify
- surface the affected area and blast radius
- context sufficiency check
- targeted research
- prove the evidence basis for planning
- verified plan
- phase / wave decomposition
- sequential execution

If your Codex build exposes a native planner:
- keep a short 3 to 7 step mirror there
- use it to show the current gate and active phase or wave
- when the active route is a phase checkpoint, show whether the next action is `compact`, `clear`, or `relock`
- keep the run artifact as the source of truth

## 3. Use the narrow executor when you want step-by-step verification

If you want one-step execution with tight verification:

```text
Use $qc-lock for this task: <describe the step>. If upstream planning is missing, do a short preflight first. Keep scope locked and verify each step before moving on.
```

This pushes Codex toward:
- short preflight when the affected area is not yet explicit
- short explicit plan
- locked scope
- one-step execution
- verify before moving on

## 4. Recover cleanly after interruption

If you come back after a pause or a fresh session:

```bash
node bin/quick-codex.js status --dir /path/to/project
node bin/quick-codex.js resume --dir /path/to/project
```

Expected behavior:
- `status` tells you the active continuity artifact, gate, risks, and next verify
- `resume` prints the exact next prompt to paste plus the active carry-forward cues and any experience constraints to keep in view
- when native planner support exists in the current Codex build, `qc-flow` should keep that planner synced as a short progress mirror rather than a second source of continuity truth
- at phase checkpoints, that planner mirror should also surface the action family the operator should expect next: `compact`, `clear`, or `relock`
- `checkpoint-digest` prints a resume card plus deliberate-compaction cues before a pause or a broad verify, including `Baseline action`, optional `Brain verdict`, `Explicit suggested action`, and any same-phase `Next Wave Pack`
- `repair-run` rewrites stale flow-run resumability sections, including `Wave Handoff`, preserves compact lock artifacts, and realigns `STATE.md`
- `doctor-run` tells you if the flow run or lock artifact is stale, incomplete, or missing required continuity fields, including a scored handoff-sufficiency check for flow runs
- `lock-check` tells you whether a run is explicit enough to hand off to locked execution without guessing
- `verify-wave` runs the active wave's `Verify:` bullets and appends one-line evidence to `Verification Ledger`
- `regression-check` reruns the active regression/protected-boundary checks, preferring the current wave, then `Latest Phase Close -> Verification completed`, and only then `Next verify`
- if either verification command reports a blocked unsafe command, inspect the artifact and rerun with `--allow-shell-verify` only when the shell syntax is intentional
- `close-wave` marks the active verified wave done, can auto-route to the next same-phase wave defined in `Verified Plan -> Waves`, can write `Latest Phase Close` with `Phase Relation` plus keep/drop carry-forward fields when the phase is complete, and when the roadmap is complete it writes `Latest Feature Close` and moves the run to `done`
- when the next route stays in the same phase, `close-wave` also writes a narrow `Next Wave Pack` so the next wave can resume without rereading the whole execution-wave narrative
- `CONTINUITY-CONTRACT.md` defines which surface owns run, lock, pointer, and guidance continuity state

`STATE.md` stays pointer-only:
- `Active run` points to the main continuity artifact
- optional `Active lock` points to the currently active lock handoff

If `doctor-run` fails on an older or partially updated run:

```bash
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
```

After repair, expect the flow artifact to carry:
- `Compact-Safe Summary` with `Phase relation`, `Compaction action`, optional brain verdict fields, `Carry-forward invariants`, `What to forget`, and `What must remain loaded`
- `Wave Handoff` with trigger, source checkpoint, next target, optional brain verdict fields, and sealed decisions
- `Next Wave Pack` whenever a same-phase route is already explicit

If you already have recent Experience Engine hook output:

```bash
node bin/quick-codex.js capture-hooks --dir /path/to/project --input /path/to/hooks.txt
```

If you want Experience Engine to evaluate the next tool action directly:

```bash
node bin/quick-codex.js sync-experience --dir /path/to/project --tool Write --tool-input '{"file_path":"src/app.ts"}'
```

`single is good, better together`:
- without Experience Engine, Quick Codex still produces the protocol baseline and a safe suggested action
- with Experience Engine, the same checkpoint can also carry a guarded brain verdict that confirms or vetoes the baseline action
- model choice and cost routing stay upstream in Experience Engine; `quick-codex-wrap` now consumes the returned `route-model` verdict, passes `-m <model>` to Codex, and posts `route-feedback` after executed turns
- if Experience Engine also returns `reasoningEffort`, the wrapper passes it through as `-c model_reasoning_effort="..."` so the Codex reasoning menu does not need to be picked manually for routed launches
- raw-task routing now handles Vietnamese prompts better in both the local fallback router and the shell-first wrapper path

Wrapper-first local UX:

```bash
node bin/quick-codex.js install-codex-shim --force
codex
```

- bare `codex` now opens the interactive wrapper shell
- each entered line is routed through the thin wrapper before Codex sees it
- `codex "fix the wrapper follow loop"` stays as the one-shot wrapper shortcut
- qc-only overlays also default into the wrapper, so `codex --qc-full --qc-task "..."` now routes to wrapper auto mode without needing `--qc-auto`
- if Experience Engine returns `needs_disambiguation`, the shell shows numbered route options plus a free-text path instead of guessing
- `codex --qc-bypass` is the escape hatch for the raw Codex TUI
- shell commands:
  - `/task <text>`
  - `/perm <safe|full|yolo|readonly>`
  - `/route <auto|flow|lock|direct>`
  - `/approval <manual|autonomous|untrusted>`
  - `/mode <fast|safe|follow-safe>`
  - `/follow <on|off>`
  - `/turns <n>`
  - `Tab` completes these slash commands and known profile values

Project-local wrapper defaults live in:

```json
{
  "version": 1,
  "defaults": {
    "permissionProfile": "safe",
    "approvalMode": null,
    "executionProfile": "follow-safe",
    "chat": {
      "follow": true,
      "maxTurns": 5
    }
  }
}
```

Manual route overrides:

```bash
codex --qc-force-flow --qc-task "research the repo and plan the work" --qc-json
codex --qc-force-lock --qc-task "fix one narrow bug in README.md" --qc-json
codex --qc-force-direct --qc-task "explain the wrapper architecture" --qc-json
```

Routing safety layers:
- brain route when Experience Engine is alive
- heuristic fallback when the brain is unavailable
- explicit manual override when the operator wants to force the route

If you are updating an older lock artifact:
- add the compact bridge fields instead of copying flow sections
- keep `STATE.md` pointer-only; use optional `Active lock` when locked execution is the active handoff
- smoke check with `status`, `resume`, and `doctor-run` on both the flow run and the lock artifact
- use `close-wave --phase-done` when the active wave also completes the phase and you want a mechanical `Latest Phase Close`
- if you want `close-wave` to surface the next wave automatically, keep the `## Waves` table current in the `qc-flow` run

## 5. What to expect

`qc-flow` may be used implicitly because its metadata allows that.

Still, for important tasks you should prefer explicit invocation, because:
- implicit invocation is probabilistic
- explicit invocation makes the workflow stable
- explicit invocation makes the skill choice obvious in transcripts

When a planning-only run finishes under `qc-flow`, expect it to end with:
- the overall picture
- the verified plan outcome
- a `Recommended next command` you can paste to continue

If that command is missing, treat the handoff as incomplete.

## 6. Development workflow

If you are editing the skill package itself:

1. Edit the files in this repo
2. Restart Codex if needed
3. Re-run a real task through the skill with a persistent run artifact
4. Verify affected area, evidence basis, and handoff behavior with concrete artifacts, not only by reading the docs
5. Exercise `status`, `resume`, `lock-check`, `verify-wave`, `close-wave`, or `doctor-run` when the task uses `qc-flow`
6. Use `regression-check` before phase close when protected-boundary verification should not rely on chat narration
7. Use `close-wave --phase-done` to write `Latest Phase Close` instead of summarizing that step only in chat
8. If Experience Engine warnings affect scope or verify, persist them into `Experience Snapshot` before pausing or running broad verification

Optional commands:

```bash
node bin/quick-codex.js upgrade
node bin/quick-codex.js uninstall
node bin/quick-codex.js uninstall --dir /path/to/project
```

`uninstall` behavior:
- without `--dir`, it removes installed skills from the current target (default: `~/.agents/skills`)
- with `--dir`, it also removes `.quick-codex-flow/` and any quick-codex-only AGENTS scaffold in that project
