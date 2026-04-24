# Quick Start

Recommended current surface: install the skills and invoke `qc-flow` or `qc-lock` explicitly when a task needs durable workflow state.

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
node bin/quick-codex.js project-status --dir /path/to/project
node bin/quick-codex.js sync-project --dir /path/to/project --run .quick-codex-flow/<run>.md
node bin/quick-codex.js delegate-research --dir /path/to/project --run .quick-codex-flow/<run>.md --question "..." --scope "..."
node bin/quick-codex.js delegate-plan-check --dir /path/to/project --run .quick-codex-flow/<run>.md --focus "..." --scope "..."
node bin/quick-codex.js delegate-goal-audit --dir /path/to/project --run .quick-codex-flow/<run>.md --focus "..." --scope "..."
node bin/quick-codex.js complete-delegation --dir /path/to/project --run .quick-codex-flow/<run>.md --type plan-check --status completed --summary "..." --verdict "pass"
node bin/quick-codex.js capture-hooks --dir /path/to/project --input /path/to/hooks.txt
node bin/quick-codex.js sync-experience --dir /path/to/project --tool Write --tool-input '{"file_path":"src/app.ts"}'
node bin/quick-codex.js checkpoint-digest --dir /path/to/project
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
node bin/quick-codex.js doctor-flow --dir /path/to/project --run .quick-codex-flow/<run>.md
node bin/quick-codex.js doctor-project --dir /path/to/project
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

Hard rules in the current flow protocol:
- discuss -> explore -> research -> delivery roadmap -> phase-local plan -> plan-check -> execute
- unresolved gray areas are a hard stop for roadmap, planning, and execution
- each gray area must produce at least 3 user-facing options, with one recommended option and a free-text path
- delegated `research`, `plan-check`, and `goal-audit` checkpoints are blocking; the main flow does not advance until their result is merged back into the run artifact
- `Delivery Roadmap` is mandatory before execution; `Verified Plan` is only for the active roadmap phase
- `PROJECT-ROADMAP.md` and `BACKLOG.md` keep milestone, backlog, deferred-decision, and future-seed state outside any single run
- `Discuss Register`, `Decision Register`, `Dependency Register`, and `Goal-Backward Verification` make the flow closer to a single-agent GSD discipline instead of a thin artifact shell

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
- `status` tells you the active continuity artifact, gate, risks, roadmap phase, unresolved gray areas, and the preferred auto-continue command for flow work
- `project-status` tells you the current milestone, active run register, cross-run dependencies, and backlog/deferred/future-seed counts
- `resume` prints the exact next prompt to paste plus the active carry-forward cues and any experience constraints to keep in view
- `status` and `resume` also surface any blocking delegated checkpoint plus its worker prompt, so the operator does not need to rediscover what the next role-specific audit should do
- when native planner support exists in the current Codex build, `qc-flow` should keep that planner synced as a short progress mirror rather than a second source of continuity truth
- at phase checkpoints, that planner mirror should also surface the action family the operator should expect next: `compact`, `clear`, or `relock`
- `checkpoint-digest` prints a resume card plus deliberate-compaction cues before a pause or a broad verify, including `Baseline action`, optional `Brain verdict`, `Explicit suggested action`, and any same-phase `Next Wave Pack`
- `repair-run` rewrites stale flow-run resumability sections, including `Workflow State`, `Gray Area Register`, `Delivery Roadmap`, and `Wave Handoff`, preserves compact lock artifacts, and realigns `STATE.md`
- `doctor-run` tells you if the flow run or lock artifact is stale, incomplete, or missing required continuity fields, including a scored handoff-sufficiency check for flow runs
- `doctor-flow` validates the flow-only hard rules: `Workflow State`, `Delegation State`, `Gray Area Register`, `Delivery Roadmap`, current roadmap phase, delegated checkpoint discipline, and gray-area discipline before roadmap/plan/execute
- `doctor-project` validates the project-level governance files so milestone, backlog, deferred-decision, and future-seed state stay durable
- `sync-project` syncs the active flow run into the project-level roadmap register
- `delegate-research`, `delegate-plan-check`, and `delegate-goal-audit` assign serialized blocking checkpoints when you want role separation without background orchestration
- `complete-delegation` records the delegated result so `doctor-flow` and future resumes can advance safely
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
node bin/quick-codex.js doctor-flow --dir /path/to/project --run .quick-codex-flow/<run>.md
node bin/quick-codex.js doctor-project --dir /path/to/project
```

After repair, expect the flow artifact to carry:
- `Project Alignment` with project board, milestone, track, and run class
- `Workflow State` with current stage, current gate, roadmap phase, roadmap phase status, and next required transition
- `Discuss Register` with explicit options, recommendation, and chosen answer for non-trivial ambiguity
- `Decision Register` for durable decisions that should survive a clear session
- `Dependency Register` for cross-phase and cross-run dependency state
- `Gray Area Register` with each unresolved question explicitly tracked
- `Delivery Roadmap` with roadmap phase rows and the next roadmap checkpoint
- `Goal-Backward Verification` so phase-close and feature-close checkpoints prove outcome closure instead of only local task completion
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
- model choice and cost routing stay upstream in Experience Engine; Quick Codex records relevant hook warnings and advisor verdicts into the run artifact when they affect workflow safety

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
