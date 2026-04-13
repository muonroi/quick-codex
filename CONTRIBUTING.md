# Contributing

## Goal

Contribute improvements that make Codex more reliable on real tasks, not just cleaner on paper.

Prefer changes that:
- reduce drift
- improve resume safety
- strengthen verification
- keep artifact state explicit

## Package principles

1. Keep context externalized
   Skills should prefer run artifacts over hidden state in chat.

2. Keep workflows narrow
   Codex performs better when steps, gates, and state transitions are explicit.

3. Protect verification integrity
   A workflow change is not done until a real task has exercised it and produced evidence.

4. Avoid overclaiming implicit behavior
   `allow_implicit_invocation: true` increases the chance of auto-use, but it does not guarantee it.

## When editing a skill

Check:
- `SKILL.md` for trigger wording and workflow rules
- `agents/openai.yaml` for display metadata and implicit invocation policy
- `references/` for templates and artifact formats

Keep changes coherent across all three.

## Preferred validation style

Use a real task when possible.

Good validation:
- run a real task through the skill
- keep a persistent run artifact
- record verification commands and outputs
- note any relock or edge-case discovery

Weak validation:
- only reading the text
- only saying the workflow "looks right"

## Documentation expectations

If the package shape changes, update:
- `README.md`
- `QUICKSTART.md`
- `EXAMPLES.md`
- `TASK-SELECTION.md`
- this file if the contributor workflow changes materially

Before publishing or opening a pull request, run:

```bash
bash scripts/lint-skills.sh
```

## Design constraints

Do:
- keep docs concrete
- keep templates short and reusable
- make resume paths obvious
- prefer ASCII unless the file already uses Unicode

Do not:
- turn the package into a generic productivity framework
- add broad abstractions without a verified task that needs them
- claim behavior that Codex does not reliably exhibit
