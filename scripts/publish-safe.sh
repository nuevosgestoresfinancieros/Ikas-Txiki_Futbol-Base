#!/usr/bin/env bash
# Publicación local, deliberadamente estricta. No modifica Apache, MongoDB ni .env.
set -euo pipefail

readonly EXPECTED_REPOSITORY="/var/www/ikastxiki"
readonly FRONTEND_DIR="frontend"
readonly BUILD_DIR="$FRONTEND_DIR/build"
readonly RELEASE_BACKUPS_DIR="$FRONTEND_DIR/.release-backups"

dry_run=0
if [[ ${1:-} == "--dry-run" ]]; then
  dry_run=1
  shift
fi
message=${1:-}

die() { echo "ERROR: $*" >&2; exit 1; }
say() { printf '\n==> %s\n' "$*"; }

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
[[ "$repo_root" == "$EXPECTED_REPOSITORY" ]] || die "Este comando solo puede usarse en $EXPECTED_REPOSITORY."
[[ "$(pwd -P)" == "$EXPECTED_REPOSITORY" ]] || die "Ejecuta el comando desde $EXPECTED_REPOSITORY."
[[ "$(git branch --show-current)" == "main" ]] || die "La publicación segura exige la rama main."
[[ -n "${message//[[:space:]]/}" ]] || die "Uso: scripts/publish-safe.sh \"Describe el cambio\""
[[ $# -eq 1 ]] || die "Uso: scripts/publish-safe.sh [--dry-run] \"Describe el cambio\""

temporary_build=""
published_build=0
backend_changed=0
backend_released=0
backend_backup=""
previous_build_backup=""
release_stamp="$(date -u +%Y%m%dT%H%M%SZ)"

cleanup() { [[ -z "$temporary_build" || ! -e "$temporary_build" ]] || rm -rf -- "$temporary_build"; }
trap cleanup EXIT

is_sensitive_or_forbidden() {
  local file=$1 base
  base=${file##*/}
  case "$file" in
    .env|*/.env|*.env|*/.env.*|frontend/build|frontend/build/*|uploads|uploads/*|*/uploads|*/uploads/*|.release-backups|.release-backups/*|*/.release-backups|*/.release-backups/*) return 0 ;;
  esac
  case "$base" in
    *.bak|*.backup|*.old|*.orig|*.previous-*|*.dump|*.mongo|*.bson|*.archive|*.tar|*.tar.gz|*.tgz|*.zip|*.sql|*.sqlite|*.sqlite3|*.pem|*.key|*.p12|*.pfx|id_rsa|id_ed25519) return 0 ;;
  esac
  case "$file" in *.xls|*.xlsx|*.xlsm) [[ "$file" != backend/templates/plantilla_*.xlsx ]] && return 0 ;; esac
  return 1
}

is_allowed() {
  local file=$1
  is_sensitive_or_forbidden "$file" && return 1
  case "$file" in
    backend/*)
      case "$file" in backend/venv/*|backend/data/*|backend/backups/*|backend/*backup*|backend/*dump*) return 1 ;; esac
      return 0 ;;
    frontend/src/*|frontend/public/*) return 0 ;;
    frontend/package.json|frontend/yarn.lock|frontend/components.json|frontend/craco.config.js|frontend/eslint.config.js|frontend/jsconfig.json|frontend/postcss.config.js|frontend/tailwind.config.js|frontend/.env.example|frontend/.gitignore) return 0 ;;
    docs/*|scripts/*|.githooks/*|README.md|AGENTS.md|CLAUDE.md|.gitignore) return 0 ;;
  esac
  return 1
}

rollback() {
  local reason=$1
  echo "PUBLICACIÓN FALLIDA: $reason" >&2
  echo "Rollback: se restaurará el build anterior si llegó a sustituirse." >&2
  if (( published_build )); then
    [[ ! -d "$BUILD_DIR" ]] || mv -- "$BUILD_DIR" "$RELEASE_BACKUPS_DIR/build-failed-$release_stamp"
    if [[ -n "$previous_build_backup" && -d "$previous_build_backup" ]]; then
      mv -- "$previous_build_backup" "$BUILD_DIR"
      echo "Rollback: build anterior restaurado desde $previous_build_backup." >&2
    else
      echo "Rollback: no había build anterior que restaurar." >&2
    fi
  fi
  if (( backend_changed && backend_released )); then
    if [[ -n "$backend_backup" && -f "$backend_backup" ]]; then
      tar -xf "$backend_backup" -C .
      echo "Rollback: versiones previas de backend restauradas desde $backend_backup." >&2
    fi
    systemctl restart ikastxiki-backend.service || echo "Rollback: no se pudo reiniciar ikastxiki-backend.service; reinícialo manualmente." >&2
  fi
  echo "Rollback terminado. Revisa git status y el health endpoint antes de reintentar." >&2
  exit 1
}

say "Sincronizando guías de asistentes"
scripts/sync-agent-guides.sh
scripts/check-agent-guides.sh

declare -A changed=()
while IFS= read -r -d '' file; do changed["$file"]=1; done < <(git diff --name-only -z HEAD)
while IFS= read -r -d '' file; do changed["$file"]=1; done < <(git ls-files --others --exclude-standard -z)
(( ${#changed[@]} > 0 )) || die "No hay cambios para publicar."
for file in "${!changed[@]}"; do
  if ! is_allowed "$file"; then
    echo "Archivo rechazado (fuera de alcance o sensible): $file" >&2
    die "No se ha hecho commit ni publicación. Retira o separa los archivos rechazados."
  fi
done

mapfile -t files_to_stage < <(printf '%s\n' "${!changed[@]}" | LC_ALL=C sort)
say "Preparando únicamente archivos permitidos"
git add -A -- "${files_to_stage[@]}"
git diff --cached --quiet && die "No hay cambios preparados para publicar."
for file in $(git diff --cached --name-only --diff-filter=ACMR); do
  [[ "$file" == backend/* ]] && backend_changed=1
  if ! is_allowed "$file"; then
    echo "Archivo rechazado en el índice: $file" >&2
    die "No se ha hecho commit ni publicación."
  fi
done

message_file=$(mktemp)
printf '%s\n' "$message" > "$message_file"
trap 'rm -f -- "$message_file"; cleanup' EXIT
scripts/check-documentation.sh "$message_file"

say "Ejecutando pruebas de backend"
backend/venv/bin/python -m pytest -q
say "Ejecutando pruebas completas de frontend"
(cd "$FRONTEND_DIR" && CI=true yarn test --watchAll=false)
say "Ejecutando lint de frontend"
(cd "$FRONTEND_DIR" && yarn lint)
say "Comprobando espacios en el diff"
git diff --check --cached

temporary_build=$(mktemp -d "$FRONTEND_DIR/.publish-build.XXXXXX")
say "Construyendo producción temporalmente en $temporary_build"
(cd "$FRONTEND_DIR" && BUILD_PATH="$repo_root/$temporary_build" yarn build)
[[ -f "$temporary_build/index.html" ]] || die "El build temporal no generó index.html."

if (( dry_run )); then
  say "SIMULACIÓN COMPLETADA"
  echo "Staging permitido: ${#files_to_stage[@]} archivo(s)."
  echo "Build temporal verificado: $temporary_build"
  echo "Backup simulado: $RELEASE_BACKUPS_DIR/build-$release_stamp"
  echo "Rollback simulado: restauraría ese backup mediante renombrado atómico."
  if (( backend_changed )); then echo "Simulación: habría reinicio de ikastxiki-backend.service."; else echo "Simulación: no se reiniciaría ikastxiki-backend.service (sin cambios en backend/)."; fi
  exit 0
fi

previous_commit=$(git rev-parse HEAD)
say "Creando commit"
git commit -F "$message_file"
say "Enviando main a origin"
git push origin main || rollback "falló git push origin main"
mkdir -p -- "$RELEASE_BACKUPS_DIR"
if (( backend_changed )); then
  backend_backup="$RELEASE_BACKUPS_DIR/backend-$release_stamp.tar"
  git archive --format=tar "$previous_commit" backend > "$backend_backup"
fi
if [[ -d "$BUILD_DIR" ]]; then
  previous_build_backup="$RELEASE_BACKUPS_DIR/build-$release_stamp"
  mv -- "$BUILD_DIR" "$previous_build_backup"
fi
mv -- "$temporary_build" "$BUILD_DIR"
temporary_build=""
published_build=1
find "$BUILD_DIR" -type d -exec chmod 755 {} +
find "$BUILD_DIR" -type f -exec chmod 644 {} +
if (( backend_changed )); then backend_released=1; systemctl restart ikastxiki-backend.service || rollback "falló el reinicio de ikastxiki-backend.service"; fi
curl -fsS http://127.0.0.1:8003/api/health >/dev/null || rollback "falló la comprobación de salud"

say "PUBLICACIÓN COMPLETADA"
echo "Build publicado: $BUILD_DIR"
echo "Build anterior: ${previous_build_backup:-no existía}"
echo
echo "cd ~/Documents/Proyectos/ikastxiki"
echo "git pull --ff-only"
