#!/usr/bin/env bash

set -euo pipefail

command_name="${1:-}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration_directory="${repository_root}/migrations"

if [[ "${command_name}" != "up" && "${command_name}" != "down" && "${command_name}" != "status" ]]; then
  echo "Usage: scripts/migrate.sh <up|down|status>" >&2
  exit 64
fi

psql() {
  docker compose --project-directory "${repository_root}" exec -T postgres \
    psql --username=opintel --dbname=opintel --set=ON_ERROR_STOP=1 "$@"
}

ensure_bookkeeping() {
  psql <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migration (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL
}

applied_version() {
  psql --tuples-only --no-align \
    --command "SELECT version FROM schema_migration WHERE version = '$1';" | tr -d '[:space:]'
}

apply_migration() {
  local migration_path="$1"
  local filename version name

  filename="$(basename "${migration_path}")"
  version="${filename%%_*}"
  name="${filename#*_}"
  name="${name%.up.sql}"

  if [[ -n "$(applied_version "${version}")" ]]; then
    return
  fi

  psql --single-transaction < "${migration_path}"
  psql --command "INSERT INTO schema_migration (version, name) VALUES ('${version}', '${name}');"
}

revert_latest_migration() {
  local latest migration_path

  latest="$(psql --tuples-only --no-align \
    --command 'SELECT version FROM schema_migration ORDER BY applied_at DESC, version DESC LIMIT 1;' | tr -d '[:space:]')"
  if [[ -z "${latest}" ]]; then
    echo "No applied migration to revert." >&2
    exit 1
  fi

  migration_path="$(find "${migration_directory}" -maxdepth 1 -type f -name "${latest}_*.down.sql" -print -quit)"
  if [[ -z "${migration_path}" ]]; then
    echo "No down migration exists for ${latest}." >&2
    exit 1
  fi

  psql --single-transaction < "${migration_path}"
  psql --command "DELETE FROM schema_migration WHERE version = '${latest}';"
}

ensure_bookkeeping

case "${command_name}" in
  up)
    while IFS= read -r migration_path; do
      apply_migration "${migration_path}"
    done < <(find "${migration_directory}" -maxdepth 1 -type f -name '*.up.sql' -print | sort)
    ;;
  down)
    revert_latest_migration
    ;;
  status)
    psql --command 'SELECT version, name, applied_at FROM schema_migration ORDER BY version;'
    ;;
esac
