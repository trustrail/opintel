#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
usage(){ echo 'engine.sh --env-file FILE [--project-name NAME] prepare OUTPUT_JSON'; echo 'engine.sh --env-file FILE [--project-name NAME] start|stop|status egress|engine'; echo 'engine.sh --env-file FILE [--project-name NAME] pin'; }
if [[ ${1:-} == --help ]]; then usage; exit 0; fi
[[ ${1:-} == --env-file && -n ${2:-} ]] || { usage >&2; exit 2; }
env_file="$2"; shift 2
[[ "$env_file" == /* && -f "$env_file" ]] || { echo 'Use an absolute existing environment file.' >&2; exit 2; }
project=opintel-engine
if [[ ${1:-} == --project-name ]]; then project="${2:?set project name}"; shift 2; fi
command="${1:?set command}"; shift
case "$command" in
 prepare) service=prepare; [[ $# == 1 && "$1" == /* ]] || { usage >&2; exit 2; };;
 pin) service=engine; [[ $# == 0 ]] || { usage >&2; exit 2; };;
 start|stop|status) [[ $# == 1 && ( "$1" == engine || "$1" == egress ) ]] || { usage >&2; exit 2; }; service="$1";;
 *) usage >&2; exit 2;;
esac
if [[ "$service" == engine ]]; then
 companion="$(docker ps --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=egress --format '{{.ID}}')"
 if [[ "$command" == start || "$command" == pin ]]; then
  [[ -n "$companion" && "$companion" != *$'\n'* ]] || { echo 'Start exactly one local egress companion first.' >&2; exit 1; }
  [[ "$(docker inspect --format '{{.State.Health.Status}}' "$companion")" == healthy ]] || { echo 'Local egress policy is not ready.' >&2; exit 1; }
 fi
 export ENGINE_NETWORK_CONTAINER="${companion:-not-running}"
fi
compose=(docker compose --project-name "$project" --env-file "$env_file" -f "$root/services/$service.json")
images="$("${compose[@]}" config --images)"
while IFS= read -r image; do
 case "$image" in *@sha256:*) digest="${image##*@sha256:}";; *) echo 'Every package image must be pinned by digest.' >&2; exit 2;; esac
 [[ ${#digest} == 64 && "$digest" != *[!0-9a-f]* ]] || { echo 'Invalid image digest.' >&2; exit 2; }
done <<< "$images"
case "$command" in
 prepare)
  output="$1"; mkdir -p "$(dirname "$output")/control"; chmod 0777 "$(dirname "$output")/control"
  touch "$(dirname "$output")/control/hosts"; chmod 0666 "$(dirname "$output")/control/hosts"
  temp="$(mktemp "${output}.XXXXXX")"; trap 'rm -f "$temp"' EXIT
  "${compose[@]}" run --rm --no-deps prepare > "$temp"
  chmod 0644 "$temp"; mv "$temp" "$output"; trap - EXIT;;
 start) exec "${compose[@]}" up --detach --no-deps --pull missing --wait "$service";;
 stop) exec "${compose[@]}" stop "$service";;
 status) exec "${compose[@]}" ps "$service";;
 pin) exec "${compose[@]}" run --rm --no-deps engine node sidecar/pin-command.js;;
esac
