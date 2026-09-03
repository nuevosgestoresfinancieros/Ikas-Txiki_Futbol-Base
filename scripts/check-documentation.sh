#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
message_file=${1:-}

if [[ -z "$message_file" || ! -f "$message_file" ]]; then
  echo "Uso: scripts/check-documentation.sh ARCHIVO_MENSAJE_COMMIT" >&2
  exit 2
fi

mapfile -t changed_files < <(git -C "$repo_root" diff --cached --name-only --diff-filter=ACMR)

has_docs_change=0
functional_change=0
for file in "${changed_files[@]}"; do
  [[ "$file" == docs/* ]] && has_docs_change=1
  case "$file" in backend/*|frontend/src/*) ;; *) continue ;; esac
  case "$file" in backend/tests/*|frontend/src/__tests__/*|*.test.*|*.spec.*) continue ;; esac
  # Los cambios que solo modifican espacios no requieren documentación.
  if git -C "$repo_root" diff --cached -w --quiet -- "$file"; then
    continue
  fi
  functional_change=1
done

if (( ! functional_change || has_docs_change )); then
  exit 0
fi

if grep -Eq '^Docs:[[:space:]]*N/A[[:space:]]+—[[:space:]]*[^[:space:]].*$' "$message_file"; then
  exit 0
fi

echo "Hay cambios funcionales preparados en backend/ o frontend/src/ sin cambios preparados en docs/." >&2
echo "Añade documentación o el tráiler: Docs: N/A — motivo" >&2
exit 1
