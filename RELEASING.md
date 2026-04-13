# Releasing Quick Codex

Use this checklist before publishing `quick-codex` to npm.

## Requirements

- npm account with publish access
- local checkout at `quick-codex/`
- clean git state
- `NPM_TOKEN` set in GitHub Actions if you want automated publish

## Local publish flow

1. Verify the package:

```bash
bash scripts/lint-skills.sh
npm publish --dry-run
```

2. Log in to npm if needed:

```bash
npm login
```

3. Publish:

```bash
npm publish
```

4. Verify the public install surface:

```bash
npx quick-codex --help
npx quick-codex install
```

## Versioning

Update the version in `package.json` before each release.

Examples:

```bash
npm version patch
npm version minor
npm version major
```

Then push the commit and tag:

```bash
git push origin main --follow-tags
```

## GitHub Actions publish

The included workflow publishes on tags matching `v*`.

Setup:

1. Add `NPM_TOKEN` in GitHub repository secrets.
2. Create and push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow will:
- run package lint
- run `npm publish`

## Notes

- `npx quick-codex install` only works globally after a successful npm publish.
- Before publish, use the local form:

```bash
npx --yes ./quick-codex install
```
