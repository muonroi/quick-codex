#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIRS=(
  "$ROOT_DIR/qc-flow"
  "$ROOT_DIR/qc-lock"
)
PACKAGE_DOCS=(
  "$ROOT_DIR/README.md"
  "$ROOT_DIR/QUICKSTART.md"
  "$ROOT_DIR/CONTRIBUTING.md"
  "$ROOT_DIR/EXAMPLES.md"
  "$ROOT_DIR/TASK-SELECTION.md"
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/bin/quick-codex.js"
  "$ROOT_DIR/templates/AGENTS.snippet.md"
  "$ROOT_DIR/templates/.quick-codex-flow/README.md"
  "$ROOT_DIR/templates/.quick-codex-flow/STATE.md"
  "$ROOT_DIR/templates/.quick-codex-flow/sample-run.md"
)

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

require_file() {
  local path="${1:?missing path}"
  [[ -f "$path" ]] || fail "missing file: $path"
}

check_frontmatter() {
  local skill_md="${1:?missing SKILL.md path}"
  local name_line desc_line

  head -n 1 "$skill_md" | tr -d '\r' | grep -qx -- '---' || fail "$skill_md missing opening frontmatter marker"
  name_line="$(sed -n '2p' "$skill_md" | tr -d '\r')"
  desc_line="$(sed -n '3p' "$skill_md" | tr -d '\r')"

  [[ "$name_line" =~ ^name:\ \"[^\"]+\"$ ]] || fail "$skill_md has invalid or unquoted name frontmatter"
  [[ "$desc_line" =~ ^description:\ \".+\"$ ]] || fail "$skill_md has invalid or unquoted description frontmatter"
  sed -n '4p' "$skill_md" | tr -d '\r' | grep -qx -- '---' || fail "$skill_md missing closing frontmatter marker"
}

check_openai_yaml() {
  local skill_dir="${1:?missing skill dir}"
  local yaml="$skill_dir/agents/openai.yaml"

  require_file "$yaml"
  grep -q '^interface:' "$yaml" || fail "$yaml missing interface section"
  grep -q 'default_prompt:' "$yaml" || fail "$yaml missing default_prompt"
  grep -q '^policy:' "$yaml" || fail "$yaml missing policy section"
  grep -q 'allow_implicit_invocation:' "$yaml" || fail "$yaml missing allow_implicit_invocation"
}

for doc in "${PACKAGE_DOCS[@]}"; do
  require_file "$doc"
done

for skill_dir in "${SKILL_DIRS[@]}"; do
  require_file "$skill_dir/SKILL.md"
  check_frontmatter "$skill_dir/SKILL.md"
  check_openai_yaml "$skill_dir"
done

printf 'PASS: skills package shape looks valid\n'
