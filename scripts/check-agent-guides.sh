#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
source_file="$repo_root/docs/agent-guidelines.md"
expected=$(mktemp)
trap 'rm -f "$expected"' EXIT

if [[ ! -f "$source_file" ]]; then
  echo "No existe la fuente de guías: docs/agent-guidelines.md" >&2
  exit 1
fi

{
  printf '%s\n\n' '<!-- Generado automáticamente desde docs/agent-guidelines.md; no editar directamente. -->'
  cat "$source_file"
} > "$expected"

status=0
for target in AGENTS.md CLAUDE.md; do
  if ! cmp -s "$expected" "$repo_root/$target"; then
    echo "$target no coincide con docs/agent-guidelines.md. Ejecuta scripts/sync-agent-guides.sh." >&2
    status=1
  fi
done

exit "$status"
