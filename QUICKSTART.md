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
mkdir -p ~/.codex/skills
ln -s /path/to/repo/qc-flow ~/.codex/skills/qc-flow
ln -s /path/to/repo/qc-lock ~/.codex/skills/qc-lock
```

Or copy them:

```bash
mkdir -p ~/.codex/skills
cp -R /path/to/repo/qc-flow ~/.codex/skills/
cp -R /path/to/repo/qc-lock ~/.codex/skills/
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
node bin/quick-codex.js checkpoint-digest --dir /path/to/project
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
```

## 2. Start from the pain point, not the theory

If Codex is losing the thread on a medium task:

```text
Use $qc-flow for this task: <describe the task>. Keep a persistent run artifact and do not rely on chat memory.
```

If the task tends to drift or reopen scope:
- clarify
- context sufficiency check
- targeted research
- verified plan
- phase / wave decomposition
- sequential execution

## 3. Use the narrow executor when you want step-by-step verification

If you want one-step execution with tight verification:

```text
Use $qc-lock for this task: <describe the step>. Keep scope locked and verify each step before moving on.
```

This pushes Codex toward:
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
- `status` tells you the active run, gate, risks, and next verify
- `resume` prints the exact next prompt to paste
- `checkpoint-digest` prints the compact-safe handoff before a pause or a broad verify
- `repair-run` rewrites stale resumability sections and realigns `STATE.md`
- `doctor-run` tells you if the run artifact is stale or incomplete

If `doctor-run` fails on an older or partially updated run:

```bash
node bin/quick-codex.js repair-run --dir /path/to/project
node bin/quick-codex.js doctor-run --dir /path/to/project
```

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
3. Re-run a real task through the skill
4. Verify with concrete artifacts, not only by reading the docs

Optional commands:

```bash
node bin/quick-codex.js upgrade
node bin/quick-codex.js uninstall
node bin/quick-codex.js uninstall --dir /path/to/project
```

`uninstall` behavior:
- without `--dir`, it removes installed skills from `~/.codex/skills`
- with `--dir`, it also removes `.quick-codex-flow/` and any quick-codex-only AGENTS scaffold in that project
