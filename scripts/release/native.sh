#!/usr/bin/env bash
# Native arm64 release operator; no terminal input or credential prompts.
phase=initialization
run_directory=
worktree=
archive_gateway=
archive_engine=
phase_log=
summary() {
  status=$?
  trap - EXIT
  printf '\nRelease exit status: %s\n' "$status"
  printf 'Run directory: %s\n' "${run_directory:-not created (preflight failed)}"
  for archive in "$archive_gateway" "$archive_engine"; do
    if [[ -n "$archive" && -f "$archive" ]]; then printf 'Archive: %s\n' "$archive";
    else printf 'Archive: not produced\n'; fi
  done
  result=
  if [[ -n "$worktree" ]]; then
    for candidate in "$worktree"/tmp/stage4-acceptance-*/result.json; do
      if [[ -f "$candidate" ]]; then result="$candidate"; fi
    done
  fi
  printf 'Acceptance result: %s\n' "${result:-not produced}"
  exit "$status"
}
fail() { printf 'Precondition failed: %s\n' "$*" >&2; exit 1; }
on_error() {
  status=$?
  printf 'Release failed during %s (line %s, exit %s).\n' "$phase" "$1" "$status" >&2
  if [[ -n "$phase_log" ]]; then printf 'Details: %s\n' "$phase_log" >&2; fi
  exit "$status"
}
trap summary EXIT
trap 'on_error "$LINENO"' ERR
trap 'printf "Release interrupted.\n" >&2; exit 130' INT
trap 'printf "Release terminated.\n" >&2; exit 143' TERM
set -Eeuo pipefail
exec </dev/null
umask 077
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never

phase=arguments
printf 'Phase: %s\n' "$phase"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
provider_file="$root/.env"
revision=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider-env)
      [[ $# -ge 2 && -n "$2" ]] || fail '--provider-env requires a file path'
      provider_file="$2"; shift 2 ;;
    --help|-h)
      printf 'Usage: %s REVISION [--provider-env PATH]\nDefault provider file: %s/.env\n' "$0" "$root"; exit 0 ;;
    -*) fail "unknown option: $1" ;;
    *) [[ -z "$revision" ]] || fail 'only one revision is accepted'; revision="$1"; shift ;;
  esac
 done
[[ -n "$revision" ]] || fail 'revision argument is required'

phase=preflight
printf 'Phase: %s\n' "$phase"
architecture="$(uname -m)"
[[ "$architecture" == arm64 || "$architecture" == aarch64 ]] || fail "architecture: native arm64 required; found $architecture"
for tool in docker git node npm make python3 openssl tar; do
  command -v "$tool" >/dev/null 2>&1 || fail "required command is missing: $tool"
done
docker info >/dev/null 2>&1 || fail 'Docker: daemon unavailable; start Docker Desktop'
docker_architecture="$(docker info --format '{{.Architecture}}')"
[[ "$docker_architecture" == arm64 || "$docker_architecture" == aarch64 ]] || fail "Docker architecture: arm64 required; found $docker_architecture"
[[ -f "$provider_file" && -r "$provider_file" ]] || fail "provider file is not a readable file: $provider_file"
provider_file="$(cd "$(dirname "$provider_file")" && pwd)/$(basename "$provider_file")"
for certificate in 223 224 225 226; do
  for name in client.crt client.key transport.key; do
    certificate_file="$HOME/.xq/v02/$certificate/$name"
    [[ -f "$certificate_file" && -r "$certificate_file" ]] || fail "certificate file is not readable: $certificate_file"
  done
done
cd "$root"
resolved_revision="$(git rev-parse --verify --end-of-options "$revision^{commit}" 2>/dev/null)" || fail "revision is not available locally: $revision (fetch the branch first)"
mkdir -p "$root/tmp"
run_directory="$(mktemp -d "$root/tmp/stage5-arm64-${resolved_revision:0:7}.XXXXXX")"
worktree="$run_directory/source"
archive_gateway="$run_directory/packages/gateway-${resolved_revision:0:7}-arm64.tar.gz"
archive_engine="$run_directory/packages/engine-${resolved_revision:0:7}-arm64.tar.gz"
printf 'Run directory: %s\n' "$run_directory"

phase='isolated checkout'
printf 'Phase: %s\n' "$phase"
phase_log="$run_directory/checkout.log"
git worktree add --detach "$worktree" "$resolved_revision" >"$phase_log" 2>&1
cd "$worktree"
mkdir -p tmp
ln -s "$provider_file" .env

phase='build dependencies'
printf 'Phase: %s\n' "$phase"
phase_log="$run_directory/npm-ci.log"
npm ci --no-audit --no-fund >"$phase_log" 2>&1
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail 'release checkout changed during dependency installation'
export PLATFORM=linux/arm64 IMAGE=all TAG="stage5-${resolved_revision:0:12}"
phase='build and audit all seven native arm64 images'
printf 'Phase: %s\n' "$phase"
phase_log="$run_directory/build.log"
make build >"$phase_log" 2>&1

phase='publish audited images by digest'
printf 'Phase: %s\n' "$phase"
phase_log="$run_directory/publish.log"
node scripts/images/publish.mjs "tmp/images/releases/$TAG-api-engine-console-egress-migrations-provisioning-demo-tools.json" "$run_directory/published-arm64.json" >"$phase_log" 2>&1

phase='create offline customer archives'
printf 'Phase: %s\n' "$phase"
phase_log="$run_directory/package.log"
node scripts/images/customer-package.mjs "$run_directory/published-arm64.json" "$run_directory/packages" >"$phase_log" 2>&1

phase='published-digest acceptance including XQ and two-minute soak'
printf 'Phase: %s\n' "$phase"
phase_log="$run_directory/acceptance.log"
RELEASE_MANIFEST="$run_directory/published-arm64.json" STAGE4_PROVIDER_ENV="$provider_file" STAGE4_KEEP_RUNNING=0 node scripts/images/stage4-smoke.mjs >"$phase_log" 2>&1
