#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
usage(){ echo 'gateway.sh --env-file FILE [--project-name NAME] start|stop|status SERVICE...'; echo 'gateway.sh --env-file FILE [--project-name NAME] migrate up|down|status'; echo 'gateway.sh --env-file FILE [--project-name NAME] schema|spicedb-migrate|owner-claim [ARGS...]'; }
if [[ ${1:-} == --help ]]; then usage; exit 0; fi
[[ ${1:-} == --env-file && -n ${2:-} ]] || { usage >&2; exit 2; }
env_file="$2"; shift 2
[[ "$env_file" == /* && -f "$env_file" ]] || { echo 'Use an absolute existing environment file.' >&2; exit 2; }
project=opintel-gateway
if [[ ${1:-} == --project-name ]]; then project="${2:?set project name}"; shift 2; fi
command="${1:?set command}"; shift
compose=(docker compose --project-name "$project" --env-file "$env_file")
add_service(){
 case "$1" in api|console|postgres|redis|spicedb-postgres|spicedb|spicedb-migrate|migrations|schema|owner-claim) compose+=(-f "$root/services/$1.json");; *) echo "Unknown gateway service: $1" >&2; exit 2;; esac
}
case "$command" in
 start|stop|status) [[ $# -gt 0 ]] || { usage >&2; exit 2; }; for service in "$@"; do add_service "$service"; done;;
 migrate) add_service migrations; [[ $# == 1 && "$1" =~ ^(up|down|status)$ ]] || { usage >&2; exit 2; };;
 schema|spicedb-migrate|owner-claim) add_service "$command";;
 *) usage >&2; exit 2;;
esac
# Compose reads operator files itself. Never execute/source environment contents.
images="$("${compose[@]}" config --images)"
while IFS= read -r image; do
 case "$image" in *@sha256:*) digest="${image##*@sha256:}";; *) echo 'Every package image must be pinned by digest.' >&2; exit 2;; esac
 [[ ${#digest} == 64 && "$digest" != *[!0-9a-f]* ]] || { echo 'Invalid image digest.' >&2; exit 2; }
done <<< "$images"
case "$command" in
 start) exec "${compose[@]}" up --detach --no-deps --pull missing "$@";;
 stop) exec "${compose[@]}" stop "$@";;
 status) exec "${compose[@]}" ps "$@";;
 migrate) exec "${compose[@]}" run --rm --no-deps migrations node src/platform/db/migrate.js "$1";;
 owner-claim) exec "${compose[@]}" run --rm --no-deps owner-claim node src/platform/ops/owner-claim.js "$@";;
 schema|spicedb-migrate) [[ $# == 0 ]] || { usage >&2; exit 2; }; exec "${compose[@]}" run --rm --no-deps "$command";;
esac
