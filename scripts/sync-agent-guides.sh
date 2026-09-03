#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
source_file="$repo_root/docs/agent-guidelines.md"

if [[ ! -f "$source_file" ]]; then
  echo "No existe la fuente de guías: docs/agent-guidelines.md" >&2
  exit 1
fi

for target in AGENTS.md CLAUDE.md; do
  {
    printf '%s\n\n' '<!-- Generado automáticamente desde docs/agent-guidelines.md; no editar directamente. -->'
    cat "$source_file"
  } > "$repo_root/$target"
done
