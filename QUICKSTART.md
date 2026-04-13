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

Initialize a project for run artifacts and prompts:

```bash
node bin/quick-codex.js init --dir /path/to/project
```

If quota pressure matters, use the lean scaffold:

```bash
node bin/quick-codex.js init --dir /path/to/project --budget-mode lean
```

Budget modes:
- `lean` for quota-sensitive or context-tight sessions
- `balanced` for default usage
- `deep` when extra planning depth is worth the cost

Burn guardrails:
- relock or checkpoint when you hit repeated wide verifies, failure loops, or stalled broad checks
- keep burn-risk decisions behavioral; do not guess token counts

Compressed handoff and output hygiene:
- when handing off to `qc-lock`, state `manual` or `auto` explicitly
- for large verify output, keep only `result`, `command or method`, `small evidence`, and `next action`

Resume after a clean session:
- keep `.quick-codex-flow/STATE.md` pointing at the current non-`done` run
- explicit resume stays best:

```text
Use $qc-flow and resume from .quick-codex-flow/<task>.md
```

- if you restart without the path, `qc-flow` can recover the active run from `STATE.md`
- `manual` reconstructs state and stops with the next command
- `auto` continues only when the next safe move is already explicit in the run file

## 2. Use the main skill explicitly

For non-trivial work, start with:

```text
Use $qc-flow for this task
```

This pushes Codex toward:
- clarify
- context sufficiency check
- targeted research
- verified plan
- phase / wave decomposition
- sequential execution

## 3. Use the narrow executor when the plan is already clear

```text
Use $qc-lock in manual mode for this task
```

This pushes Codex toward:
- short explicit plan
- locked scope
- one-step execution
- verify before moving on
- smaller retries when burn risk is rising

If you want Codex to keep advancing step by step without waiting for a new prompt:

```text
Use $qc-lock in auto mode for this task
```

## 4. What to expect

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

## 5. Development workflow

If you are editing the skill package itself:

1. Edit the files in this repo
2. Restart Codex if needed
3. Re-run a real task through the skill
4. Verify with concrete artifacts, not only by reading the docs

Optional commands:

```bash
node bin/quick-codex.js upgrade
node bin/quick-codex.js uninstall
```
