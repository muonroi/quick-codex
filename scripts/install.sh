#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${HOME}/.agents/skills"
MODE="symlink"
LEGACY_SKILLS=(
  "codex-gsd-flow"
  "codex-locked-loop"
)

usage() {
  cat <<'EOF'
Usage:
  bash scripts/install.sh [--copy]

Options:
  --copy    Copy the skill directories instead of symlinking them.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy)
      MODE="copy"
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
done

mkdir -p "$TARGET_DIR"

for legacy_skill in "${LEGACY_SKILLS[@]}"; do
  rm -rf "$TARGET_DIR/$legacy_skill"
done

install_one() {
  local skill_name="${1:?missing skill name}"
  local source_dir="$ROOT_DIR/$skill_name"
  local dest_dir="$TARGET_DIR/$skill_name"

  rm -rf "$dest_dir"
  if [[ "$MODE" == "copy" ]]; then
    cp -R "$source_dir" "$dest_dir"
  else
    ln -s "$source_dir" "$dest_dir"
  fi
}

install_one "qc-flow"
install_one "qc-lock"

printf 'Installed to %s using %s mode\n' "$TARGET_DIR" "$MODE"
printf 'Legacy compatibility target remains available via --target %s\n' "${HOME}/.codex/skills"
printf 'Removed legacy skill names if present: %s\n' "${LEGACY_SKILLS[*]}"
printf 'Restart Codex to reload the skills.\n'
