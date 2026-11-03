# Custody identity import: nested Docker key handoff

Branch `feat/steps-custody`; follow-up to the reported ARM native run
`stage5-arm64-79d667f.WGBXJB`, `013-identity-import.log`.

## Cause and evidence

The supplied output reports successful bundle import followed by:

```text
EACCES: permission denied, open '/output/api-key'
Diagnostic log could not be written to /package/diagnostics.
```

This is the **key extraction writer**, not the later certificate exchange
reader. At revision `79d667f`, `deploy/customer/command:28–29` created a directory
under host `$TMPDIR` and bound it to `/output`. The process runs as the caller's
numeric `id -u:id -g`. `scripts/operator/customer-install.ts:333–335` reads the
mode-600 package configuration and creates `/output/api-key` with mode 0600 and
`flag: 'wx'`. Its error handler at line 341 tries to write through
`operatorDiagnostic` to `/package/diagnostics`. Neither the full package nor
that diagnostic directory was mounted into this narrow extraction job.

Stage 5's nested daemon shares the acceptance **run directory**, at the same
absolute path (`scripts/images/stage5-smoke.mjs:47,94`). Host macOS `$TMPDIR` is
outside that tree. The bind source therefore addresses an unshared path in the
nested daemon, where Docker creates the missing directory as root; the
non-root extraction process cannot create the key there. The diagnostic
fallback likewise has no writable mount. Shell `set -e` stops before the
exchange is invoked. In that failure no key file was successfully written.

The intended exchange uses the **same caller UID/GID**, not a different owner
(`deploy/customer/command:214` at `79d667f`). It would read the extracted key from
`/input/api-key:ro`; extraction failed before that handoff. I cannot report the
MacBook Air's actual numeric UID/GID or directory `stat` output: those were not
included in the retained evidence available on this Intel host.

Why Intel passed: `scripts/images/steps-custody-acceptance.mjs:11,16` at
`79d667f` created an explicit agent API-key file and supplied `--api-key-file`.
That bypassed `agent_api_key` entirely. It also used the ordinary host Docker
daemon, rather than Stage 5's nested daemon. This was a harness coverage gap,
not evidence of different cryptographic behavior on the two architectures.

## Correction

- Create the temporary key directory under `$root/.agent-api-XXXXXX`, inside
  the package tree already shared with Stage 5's nested daemon. Directory mode
  stays 0700, key mode stays 0600, and extraction/exchange retain the same
  non-root caller UID/GID. Cleanup still removes the key and temporary directory.
- Mount only the private `$root/diagnostics` directory at
  `/package/diagnostics` for the extractor. No broader package mount, additional
  secret, permission widening or gateway-service device-key access is added.
- The packaged custody extension now exercises the default helper on its
  separate agent archive, rather than supplying `--api-key-file`. The archive
  runs no gateway services; its package configuration contains only the agent's
  general XQ API key. It checks temporary-key cleanup before proceeding.

## Regression coverage and validation

The existing command tests check both jobs' numeric UID/GID, the package-root
temporary source, explicit diagnostic mount, mode 0700 and cleanup. The
provisioning-runtime suite runs the compiled writer and a reader as the packaged
non-root user on actual Linux tmpfs: mode-600 key creation/read, refusal for a
different UID, and mode-600 diagnostics created/read by that same user after a
deliberate create-only overwrite failure. A root test supervisor prepares the
fixture only; product commands keep their original non-root user and limits.

An initial negative-access test on macOS bind sharing was unsuitable because
the sharing layer allowed a second container UID to read the host file. The
final permission check uses Linux tmpfs so it exercises Unix ownership directly.
This does not relax the required denial assertion.

All 10 targeted tests across three files passed (command, operator diagnostics,
provisioning-runtime). Unchanged lint/dependency checks and Bash/Node syntax
checks passed. Fresh amd64 archives
and the standard packaged first-run plus live-XQ results will be recorded here.
This is packaged-script/test work;
no additional full gate is requested or run. ARM native verification remains
an operator run on the MacBook Air.

## Packaged result: passed

Tested revision `ba8d6596f9573a15dc35d9b56316c1c78cb05fa3` was committed and
pushed before the standard build. All seven fresh amd64 images passed secret,
runtime-allowlist and readability checks. Both offline archives built and
passed their packaging audits. Standard commands:

```sh
BUILD_CANDIDATE=1 TAG=candidate-steps-custody-ba8d659 PLATFORM=linux/amd64 IMAGE=all node scripts/images/build.mjs
PLATFORM=linux/amd64 node scripts/images/customer-package.mjs tmp/images/releases/candidate-steps-custody-ba8d659-api-engine-console-egress-migrations-provisioning-demo-tools.json tmp/steps-custody-ba8d659-packages --candidate
node scripts/images/console-first-run-install.mjs tmp/steps-custody-ba8d659-packages ba8d6596f9573a15dc35d9b56316c1c78cb05fa3 --custody
```

The standard harness exited 0. Evidence directory:
`tmp/console-first-run-acceptance-lZjNj0`. Fresh archive install, one-code
pairing, ordinary source reference, SMTP owner sign-in, all six first-run steps
and a receipt visible in Activity passed.

The separate agent archive's `./identities add` used **no** `--api-key-file`:
default key extraction, device exchange and temporary-key cleanup passed. Only
its public association was handed to the gateway. Then normal `./steps sign-in`,
identity-linked `grant-access`, sealed `query`, and live-XQ
`redeem-and-unseal --show` passed. All six locally unsealed rows matched the
independent fixture. A second redemption was refused without plaintext. A fresh
grant was revoked through the console API, its revoked event read from the
receipt, and redemption was refused without plaintext or an output file.
All ten custody checks passed, including mode-600 output files and absence of
key, session-cookie or full-grant material from terminal output.

- First custody receipt: `01a19f1a-8e06-7359-b157-ff8222166065`.
- Revoked receipt: `01a19f1b-a2df-7eed-949a-f263939d82c2`.
- Revoked grant: `b4b46137-5107-402d-aff4-5f99be1146d2`.

Published evidence:

- [Actual terminal output, values redacted](steps-custody/key-handoff-ba8d659/terminal-redacted.txt).
- [Custody results](steps-custody/key-handoff-ba8d659/custody-result.json).
- [Fresh installation results](steps-custody/key-handoff-ba8d659/install-result.json).
- [Image identities](steps-custody/key-handoff-ba8d659/images.json).
- [Archive SHA-256 hashes](steps-custody/key-handoff-ba8d659/archives.sha256).

Cleanup completed; only development Postgres and Redis remained running, both
healthy. No full gate rerun or merge. The MacBook Air run directory was not
available here, and this Intel repeat is not a claim that native ARM Stage 5
has passed. Run the native command there for this tested code revision:

```sh
git fetch origin feat/steps-custody
scripts/release/native.sh ba8d6596f9573a15dc35d9b56316c1c78cb05fa3
```

Default soak: two minutes. Subsequent report-only commits do not change the
tested scripts or runtime.
