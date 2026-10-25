# Run the 30-minute development soak

Run from the repository root on `main`. This is the **external** soak against
synthetic development data, not the self-contained test-database harness. Do not
run the gate or another database-resetting test alongside it. Keep the API and
Engine running for the whole soak. XQ custody verification makes real provider
calls and consumes packets.

## 1. Install and configure the dev machine

With Docker Desktop running:

```sh
git switch main
git pull --ff-only
npm ci
umask 077
test -f .env || cp .env.example .env
chmod 600 .env
nano .env
```

Fill in the normal local PostgreSQL, Redis, SpiceDB and demo-source settings
from `.env.example`. For this local run use `MAIL_PROVIDER=file`,
`MAIL_OUTPUT_DIR=./tmp/mail` and the normal console origin
`APP_BASE_URL=http://localhost:5173`. The API is `http://127.0.0.1:3000`.

The operator must supply these existing custody settings in `.env`; placeholders
are not usable credentials:

```dotenv
OPINTEL_XQ_API_KEY=<XQ General API key>
OPINTEL_XQ_DASHBOARD_API_KEY=<XQ dashboard API key>
OPINTEL_XQ_SENDER_ALIAS=<configured sender identity>
OPINTEL_XQ_SENDER_ACCESS_TOKEN=<valid sender access token>
OPINTEL_CUSTODY_MASTER_KEY=<installation master key: 64 hex characters>
OPINTEL_XQ_REDEEM_URL=<operator-provided XQ redemption endpoint>
OPINTEL_API_BASE_URL=http://127.0.0.1:3000
```

Preserve an existing master key; do not regenerate it for a rerun. The API and
seeder load the same `.env`. The soak reads `OPINTEL_XQ_API_KEY` from the shell
or `.env`; its isolated certificate child receives that General API key, PATH
and HOME, not the sender token or observer cookie. Provider configuration belongs
to the project's custody Settings; an environment key alone does not enable it.

## 2. Install the four certificate bundles and public mapping

Obtain the **existing, location-authorized** certificate bundles from the XQ
operator/provider console. This repository does not issue them. For this fixed
fixture the identities are 223/opintelprobe, 224/opintelpoola,
225/opintelpoolb2 and 226/opintelpoolb. Do not rename devices or create replacement
licensed identities. Save the downloaded ZIPs as `223.zip` through `226.zip` in
`~/Downloads`, then extract each into its own directory:

```sh
mkdir -p "$HOME/.xq/v02" "$HOME/.opintel"
chmod 700 "$HOME/.xq" "$HOME/.xq/v02" "$HOME/.opintel"
for id in 223 224 225 226; do
  mkdir -p "$HOME/.xq/v02/$id"
  unzip -n "$HOME/Downloads/$id.zip" -d "$HOME/.xq/v02/$id"
done
find "$HOME/.xq/v02" -type d -exec chmod 700 {} \;
find "$HOME/.xq/v02" -type f -exec chmod 600 {} \;
test -f "$HOME/.xq/soak-certificates.json" ||
  cp scripts/soak/certificates.example.json "$HOME/.xq/soak-certificates.json"
chmod 600 "$HOME/.xq/soak-certificates.json"
```

Skip extraction when the correct bundles are already installed. Each directory
must contain `client.crt`, `client.key` and `transport.key`; nested extracted
directories are supported. ZIPs alone are insufficient. Keep the bundles outside
the repository. Only the custody child reads their key material.

`--soak-associations` and `--certs` take the same **public mapping file**, copied
from `scripts/soak/certificates.example.json`:

```json
[
  {"certificateId":223,"deviceName":"opintelprobe","bundlePath":"~/.xq/v02/223"},
  {"certificateId":224,"deviceName":"opintelpoola","bundlePath":"~/.xq/v02/224"},
  {"certificateId":225,"deviceName":"opintelpoolb2","bundlePath":"~/.xq/v02/225"},
  {"certificateId":226,"deviceName":"opintelpoolb","bundlePath":"~/.xq/v02/226"}
]
```

Edit only `bundlePath` if the extracted locations differ. Do not put PEMs, keys,
tokens, or a guessed recipient address in this JSON. The seeder exchanges each
certificate and obtains the recipient association from the returned `sub` claim.
HTTP 403 “not authorized for your current location” requires the XQ operator to
correct location authorization; changing the device name is not a remedy.

## 3. Start services, API diagnostics and the console

```sh
npm run dev:up
mkdir -p tmp/soak
umask 077
OPINTEL_DIAG=1 npm run dev:api > tmp/soak/runbook-api.log 2>&1
```

Leave that terminal running. `dev:up` prepares and verifies a missing signed
scanner and records its path in `tmp/sidecar/service.json`. `dev:api` loads
`.env` before importing the database pool. `OPINTEL_DIAG=1` must be on the **API
process**, not just the soak command; restart the API to change it.

In a second terminal:

```sh
npm run dev
```

In a third terminal, prepare the base demo:

```sh
npm run dev:demo
```

Sign in to the console at `http://localhost:5173` as `demo@opintel.local` using
the normal file-mail link, then select **Reinsurance Demo → Settings → Project**,
configure the XQ provider/tenant/region supplied by the operator and pass its
connection check. Do this before `--soak`; the seeder refuses unavailable XQ
custody. The API log/local mail files contain the development login link, so keep
those files private. Do not paste login links into shared logs or chat.

## 4. Prepare the soak fixture

```sh
umask 077
npm run dev:demo -- --soak \
  --soak-associations "$HOME/.xq/soak-certificates.json"
```

Wait for `Demo soak ready`. This creates the synthetic policies, claims and
recoveries sources, six objects, two cedant pools, ten caller credentials and
lifecycle probes. Local policy acknowledgment releases normal introspection;
treatments are decided only after introspection completes. Existing differing
fixture data or decisions are refused, not overwritten.

Keep `tmp/dev-demo/soak.json` (mode 600). It contains issued pool credentials and
the expected scenario specification; it is **not** the public association file.
Do not delete it to rerun: issued keys cannot be recovered from the database.
The seeder runs `ANALYZE` for the synthetic source tables.

## 5. Save and verify the observer cookie

The observer needs a current normal console session with project-view permission.
In browser developer tools, copy only the `opintel_session` cookie value. Save it
without putting it in shell history or printing it:

```sh
python3 - <<'PY'
from getpass import getpass
from pathlib import Path
import os
p = Path.home() / '.opintel' / 'observer.cookie'
p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
value = getpass('Paste only the opintel_session cookie value: ').strip()
if not value or any(c.isspace() or c == ';' for c in value):
    raise SystemExit('Invalid cookie value')
fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write('opintel_session=' + value + '\n')
p.chmod(0o600)
PY
node --input-type=module - <<'JS'
import {readFile} from 'node:fs/promises';
const m=JSON.parse(await readFile('tmp/dev-demo/soak.json','utf8'));
const cookie=(await readFile(process.env.HOME+'/.opintel/observer.cookie','utf8')).trim();
const r=await fetch(`http://127.0.0.1:3000/api/v1/projects/${m.projectId}/runs?limit=1`,
  {headers:{cookie},redirect:'error'});
console.log('Observer receipt preflight HTTP',r.status);
await r.body?.cancel();
if(!r.ok)process.exitCode=1;
JS
```

Require HTTP 200. For 401, sign in again and replace the file; for 403, use a user
with access to this project. The cookie must be outside the repository and mode
600. The observer only reads receipts; it does not authenticate agents, issue
queries, or obtain a database fallback. Its failures stop the soak.

## 6. Run 30 minutes

```sh
umask 077
set -o pipefail
node --import tsx scripts/soak/reinsurance.ts \
  --target http://127.0.0.1:3000 \
  --manifest tmp/dev-demo/soak.json \
  --custody --certs "$HOME/.xq/soak-certificates.json" \
  --observer-cookie "$HOME/.opintel/observer.cookie" \
  --agents 10 --rate 750 --seed 1 --duration 1800 \
  2>&1 | tee tmp/soak/runbook-30m.log
```

`--duration` is in **seconds** and starts after startup/preflight. `--rate 750`
is the per-caller pause in milliseconds (with jitter), not requests per second.
For the two-minute verification use the identical command with `--duration 120`
and `runbook-2m.log`. Ctrl-C stops new iterations and drains in-flight requests.
Keep the API/Engine running until the summary is printed.

## 7. Read the results

- `tmp/soak/<UTC timestamp>-<pid>.jsonl`: the report, including responses,
  certificate exchange status, invariant breaches and the final `type: summary`.
  The exact filename is printed at startup and in the summary's `log` field.
- `tmp/soak/runbook-30m.log` (or `runbook-2m.log`): terminal transcript and summary.
- `tmp/soak/runbook-api.log`: API startup/runtime log. Its `API diagnostics:` line
  names `tmp/diag/<API-start UTC timestamp>.jsonl`, the diagnostic measurements.
- `tmp/sidecar/service.log` and `tmp/sidecar/sampling-audit.jsonl`: local Engine
  operational log and sampling audit. These are not the soak's result report.

```sh
grep '^API diagnostics:' tmp/soak/runbook-api.log
# Substitute the report filename printed by the soak:
# tail -n 1 tmp/soak/<timestamp>-<pid>.jsonl
```

Require exit 0 / `SOAK PASSED`, zero invariant breaches, zero operational errors
and zero skipped receipt checks. Also inspect `coverage`, `NOT EXERCISED`,
certificate exchange statuses and `custody.verifiedValues`: PASSED alone does not
prove full scenario or custody coverage. An expired retiring probe is reported
as not exercised. Existing manifests retain its original grace window; rerunning
preparation currently does not refresh an already-completed retiring probe.
Do not delete the credential manifest or weaken the expected outcomes to hide it.

If startup reports a landing `.lock`, confirm the recorded PID is absent, no
Engine/supervisor remains and no process holds its listener or lock before moving
that specific stale lock aside. Never remove a live lock or the landing data.

## Verification on this host

Verified on `main` at `180db05`, 24 October 2026 local time (25 October UTC),
with `--duration 120`, ten callers, rate 750 and seed 1. This host already had
the demo, project custody configuration and certificate bundles; it was not a
clean installation. Preparation was rerun against those existing fixtures.
The expired observer session was replaced through the normal local file-mail
request-link/callback flow and the receipt preflight returned HTTP 200.

- Exit code: **0**, `SOAK PASSED`.
- Query attempts: **133**; 113 success, 7 `dependency_unavailable`,
  12 `element_withheld`, 1 `unsupported_on_aggregate_only`.
- Invariant breaches: **0**; operational errors: **0**; skipped receipt checks:
  **0**; receipt verification active.
- Custody values verified: **15**. Certificate 226 exchanged successfully;
  223, 224 and 225 were refused with HTTP 403 by XQ's location policy.
- Declared scenario coverage: **19/85 (22%)**. The existing retiring probe's
  grace window had expired. This verifies the two-minute procedure with partial
  coverage, not a complete 30-minute or full-custody acceptance result.
- Report: `tmp/soak/2026-10-25T00-04-13.158Z-37222.jsonl`.
- Transcript: `tmp/soak/runbook-2m.log`.
- API diagnostics: `tmp/diag/2026-10-25T00-01-54.623Z.jsonl`; verified nonempty.

The first `dev:up` stopped on an existing stale landing lock. Its PID was absent,
no Engine or supervisor remained and no process held its port or lock; the lock
was moved aside before services were started successfully. No script change was
needed. The report, cookie, manifest, bundles and diagnostics remain local and
are not committed with this runbook.
