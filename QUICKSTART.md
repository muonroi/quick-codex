# Quick Start

## 1. Install the skills

Fastest install from npm:

```bash
npx quick-codex install
```

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
- `resume` prints the exact next prompt to paste plus the active experience constraints to keep in view
- `checkpoint-digest` prints the compact-safe handoff before a pause or a broad verify
- `repair-run` rewrites stale flow-run resumability sections, preserves compact lock artifacts, and realigns `STATE.md`
- `doctor-run` tells you if the flow run or lock artifact is stale, incomplete, or missing required continuity fields
- `lock-check` tells you whether a run is explicit enough to hand off to locked execution without guessing
- `verify-wave` runs the active wave's `Verify:` bullets and appends one-line evidence to `Verification Ledger`
- `regression-check` reruns the active regression/protected-boundary checks, preferring the current wave, then `Latest Phase Close -> Verification completed`, and only then `Next verify`
- `close-wave` marks the active verified wave done, can auto-route to the next same-phase wave defined in `Verified Plan -> Waves`, and can write `Latest Phase Close` when the phase is complete
- `CONTINUITY-CONTRACT.md` defines which surface owns run, lock, pointer, and guidance continuity state

`STATE.md` stays pointer-only:
- `Active run` points to the main continuity artifact
- optional `Active lock` points to the currently active lock handoff

If `doctor-run` fails on an older or partially updated run:

```bash
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
```

If you already have recent Experience Engine hook output:

```bash
node bin/quick-codex.js capture-hooks --dir /path/to/project --input /path/to/hooks.txt
```

If you want Experience Engine to evaluate the next tool action directly:

```bash
node bin/quick-codex.js sync-experience --dir /path/to/project --tool Write --tool-input '{"file_path":"src/app.ts"}'
```

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
