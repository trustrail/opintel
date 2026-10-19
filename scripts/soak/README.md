# Manual reinsurance soak

From the repository root:

```sh
node --import tsx scripts/soak/reinsurance.ts --agents 10 --rate 750 --seed 1
node --import tsx scripts/soak/reinsurance.ts --duration 300 --pool 'Cedant 01'
```

Omit `--duration` to run until Ctrl-C. Duration starts after fixture setup. Ctrl-C
stops new iterations, drains in-flight MCP requests, prints the summary and closes
owned services. No gate, test registration, build integration or XQ calls.

Prerequisites: installed npm dependencies, Docker running with the
`authzed/spicedb:latest` image available, PostgreSQL and Redis reachable, and a
fully migrated isolated test database. `.env` supplies DATABASE_URL, REDIS_URL,
SPICEDB_ENDPOINT and SPICEDB_TOKEN; TEST_DATABASE_URL is optional (otherwise the
normal launcher derives a database name ending in `_test`). The configured
SpiceDB is not used: an isolated instance is created and removed. API, MCP and
Engine listeners are started by the fixture; no dev API or Engine is required.
The scanner must exist at `tmp/duckdb-extensions/postgres_scanner.duckdb_extension`
(`npm run sidecar:prepare-scanner`). No certificate bundles are needed.

This resets the **test database**, using the normal suite's ownership lock; never
run alongside another test-database consumer. It calls the existing V-01 fixture,
with its two pools and ten credentials. Extra callers reuse those credentials;
no new pool or credential implementation is introduced.

The composer uses only `opintel.describe` metadata, then calls `opintel.explain`
and `opintel.query`, including when explain predicts a refusal. It varies
projections, IS NOT NULL filters, numeric aggregates, withheld probes and joins
on discovered common tokenized names across sources. It is a seeded SQL explorer,
not an LLM. In self-contained mode the V-01 fixture definition is available only to the
checking oracle. External mode uses only the seeder manifest for expectations.
Clear projected columns anchor rows to the fixture; token consistency is checked
across sources and pools, and masking is checked against V-01's last4 decision.
Unidentifiable rows are alarms, not silently unchecked successes.

JSONL files under `tmp/soak/` contain every describe/explain/query response and
receipt, plus alarms and a summary; mode 0600. They contain synthetic fixture
values, never pool keys. Query latency measures the query call itself. Normal
refusals are counted by reason. Operational errors are separate from invariant
breaches; either makes exit status nonzero. Histograms/counts accumulate while
response bodies stream to disk. Disk space must accommodate the chosen duration.

`--seed` reproduces per-agent choices given the same discovery response order.
It cannot reproduce concurrency scheduling, response order, UUIDs or the number
of iterations completed in a wall-clock duration. The JSONL records the actual
queries and outcomes for examination. Receipt literal checks cover string values
(including identifiers and dates); numeric amounts are checked as result cells,
not indiscriminately searched in receipts where legitimate counts can coincide.

## Running against the console's development demo

External mode never imports the fixture bootstrap, starts services, migrates or
resets a database, creates credentials, or changes entitlements. It uses real MCP
HTTP against the running API. Query receipts, agent presence and custody grant
lifecycle events are naturally written by the product; source rows are read-only.

First prepare the running demo **as a separate operator action**. Copy the public
mapping template outside the repository, without adding recipient identifiers:

```sh
cp scripts/soak/certificates.example.json "$HOME/.xq/soak-certificates.json"
chmod 600 "$HOME/.xq/soak-certificates.json"
```

The explicit mapping has one record per certificate: `certificateId`,
`deviceName`, and `bundlePath` only. It never scans a common parent
for identities. Fixed names and distribution are enforced before exchange:

| Certificate | Fixed device name | Actual bundle path | Pool | Agents (default ten) |
|---|---|---|---|---|
| 223 | opintelprobe | ~/.xq/v02/223/ | Cedant 01 | 3 |
| 224 | opintelpoola | ~/.xq/v02/224/ | Cedant 01 | 2 |
| 225 | opintelpoolb2 | ~/.xq/v02/225/ | Cedant 02 | 3 |
| 226 | opintelpoolb | ~/.xq/v02/226/ | Cedant 02 | 2 |

223 was found at `~/.xq/v02/223/`, not the initially supplied `~/.xq/223/`.
Its ZIP has been extracted there. All four bundle directories are 700 and files
600. Different paths can be supplied explicitly, but changing a device name is
rejected: this avoids creating another licensed XQ Device member.

At startup the agent child exchanges each certificate and reads the exact `sub`
claim as its recipient identifier. It never derives an address or searches other
claims. The operator seeder uses the same child to obtain public associations
before credential issuance; no token or key material crosses that boundary. A
failed exchange creates no association. The mapping contains no PEM, private key
or transport key. Configure
XQ custody for the existing Reinsurance Demo project in Settings and pass the
connection check. The seeder refuses to bypass this requirement. The API and
seeder must use the same custody environment configuration.

```sh
npm run dev:demo -- --soak --soak-associations "$HOME/.xq/soak-certificates.json"
```

This opt-in extension preserves the existing spreadsheet demo. In the same project
and `opintel_demo` database it adds Reinsurance Policies and Reinsurance Claims
sources, containing the original V-01 policies, claims and treaty_reference tables. A third
Reinsurance Recoveries source adds recoveries, unmatched and open_reference tables. The
console sees these exact source tables, pools, credentials and decisions. The two
cedant pools have five credentials each, assigned alternately to their two fixed
certificate identities, distinct cedant predicates, and the declared treatment spread: Cedant 01's `risk_code`, Cedant 02's `broker_reference`
and `recovery_secret` are released under custody. The new `pool_only` column is
clear in Cedant 01 and undecided in Cedant 02; `undecided_note` is undecided in both.
The scoped treaty_reference object has no matching rows. It seeds only empty
source tables; differing existing data or treatment decisions are refused, never
silently replaced. Existing row decisions are preserved, so an operator's row
policy change can correctly trigger the soak's fixture oracle. These are synthetic
demo rows, not a second data copy made by the query path.

The seeder stores the issued pool credentials in `tmp/dev-demo/soak.json`, mode
600, updating it after each issuance. This is git-ignored and must be retained.
Missing keys cannot be read back from the server; the seeder refuses to rotate an
existing pool simply because its manifest is missing. No credential values need
to be assembled by hand. `--soak-manifest` changes the seeder destination;
`--manifest` selects it for the soak. The version 2 manifest records the generator hash and the complete scenario
specification: pool/object/column treatments, expected outcomes, row filters, exact
counts and synthetic expected rows. None of those expectations come from querying
the seeded database. Version 1 manifests must be upgraded by rerunning the seeder.

Have the API, Engine, PostgreSQL, Redis and the development SpiceDB running
normally (`npm run dev:api`, and the Engine started by `dev:demo`). The soak does
not start or stop them. The API needs its existing working XQ sender configuration
and custody master key; sender renewal is unchanged by this harness.

The operator supplies:

- `--certs`: the **explicit mapping JSON file** used by the seeder. Each
  `bundlePath` identifies that certificate's own extracted directory outside the
  repository, containing `client.crt`, `client.key`, and `transport.key` (nested
  extracted directories are supported). Directory mode 700 and file mode 600.
  ZIP files alone are insufficient. Only the custody agent child reads bundles.
- The General API key as `OPINTEL_XQ_API_KEY` or in `.env`. The child inherits only
  this key, PATH and HOME; no sender token, dashboard token or observer cookie.
- Required in external mode, `--observer-cookie`: an outside-repository text file containing only
  `opintel_session=<value>` from a signed-in console user with project-view
  permission. Keep it mode 600. Do not copy it into the repository or paste it
  into a terminal command. The observer sends it only on receipt-list/detail GETs,
  rejects redirects, and never prints response bodies on authorization failure.

```sh
node --import tsx scripts/soak/reinsurance.ts \
  --target http://127.0.0.1:3000 \
  --custody --certs "$HOME/.xq/soak-certificates.json" \
  --observer-cookie "$HOME/.opintel/observer.cookie" \
  --agents 10 --rate 750 --seed 1
```

Add `--duration 300` for five minutes, or press Ctrl-C to drain and stop. Custody
makes real XQ calls and consumes one packet per custody result through the
production type-8 adapter. The child attempts each distinct device certificate once at startup and
renews when its token approaches expiry. An exchange failure is a normal custody
unavailability outcome: HTTP status and sanitized body are reported once for that
certificate at startup, all affected agents continue, and a five-minute backoff
is checked every 30 seconds and before redemption. Retry attempts reuse the exact
same device name. Missing/unreadable bundles and local/network failures have a
safe explicit reason; HTTP refusal bodies are retained with secrets redacted.
The pool key remains the only MCP authentication credential. Every agent first
issues an ordinary clear/tokenized/masked projection and an aggregate query,
independently of its certificate status. Those use the same fixture invariants.
No certificate means no K2 redemption attempt, no hang waiting for a token, and
no fallback to clear custody values. The summary reports each agent's certificate,
latest exchange result/reason, offered/completed custody bundles, and ordinary
answers received while exchange was unavailable. It obtains the device identity only from `sub`, checks it against the stored public
association before redemption, redeems K2 through MCP, fetches K1
with the device bearer, and unseals locally against independent fixture values.
Shares and device tokens remain in that child; only public associations, statuses
and verification counts cross IPC. Escrow-observed, Opintel-share-release, XQ-retrieval and local
verification each get their own terminal line. “Escrow observed” means the API
returned a sealed result with a grant; it is not an extra escrow call. JSONL
redacts grants, shares, provider tenant identifiers and addresses. No certificate
key material is logged or copied.

The **observer is separate from agents**. It can only GET receipt lists/details;
it has no query, redemption, login or mutation function. External mode requires a
valid observer cookie **before any agent connects**. Any non-2xx (including 401,
403, redirects and 5xx), network/timeout, JSON or schema failure fails the run
loudly and stops new agent iterations. There is no retry or database fallback.
The terminal summary starts with PASSED/FAILED and the skipped receipt-check
count; JSON starts with status and receipt verification. Any skipped check makes
the run fail even if no other invariant broke. Missing stored receipts still
raise invariant breaches. Self-contained mode is unchanged and reads receipts
directly, with no observer cookie.

To supply a valid cookie, sign in to the running console, open browser developer
tools → Application/Storage → Cookies for that console origin, and save only
`opintel_session=<value>` in an outside-repository mode-600 file, for example
`~/.opintel/observer.cookie`. Do not paste it into a shell command, log or repo.
The preflight uses the receipt API to verify both authentication and project-read
access; a syntactically valid cookie is not evidence of a live session.

Receipt GETs already refresh the server-side idle deadline. The observer also
GETs the one-item receipt list every 30 seconds, keeping the idle session active
through slow queries or long pauses, and re-reads the cookie file per request so
an operator can replace it after a fresh sign-in **before** absolute expiry.
There is no refresh/login call or policy bypass: console sessions have a
company-defined idle timeout (default eight hours) and a 30-day absolute expiry.
Revocation, loss of Redis state or reaching absolute expiry still fails the run;
sign in again, replace the file and begin a new run. Never resume an invalid run
as if all its receipt checks passed.

### Why the 19 October cookie was rejected

The cookie file was validly shaped and last modified at 17:41 UTC on 18 October,
but its Redis session was absent (PTTL -2). The earlier fault run at 22:18 UTC
successfully verified receipts with that cookie. The normal gate runner then
passed development REDIS_URL to `test/session-store.test.ts`, which deliberately
calls FLUSHDB before tests and in its session-loss test. The gate completed those
tests before the 04:28 UTC soak. That destroys the console session independently
of whether idle expiry also occurred; the deleted record cannot establish its
former expiry time. This was a startup 401, not a mid-run token expiry.

`scripts/test.ts` now provisions and tears down an owned Redis server, overriding
REDIS_URL for its tests, just as it owns SpiceDB. Tests selecting database 1 also
remain within that owned server. The original session-loss assertions stay
unchanged. This prevents a future normal gate from erasing console/observer
sessions; it does not recreate the already-lost cookie's session.

Focused checks, separate from the gate and build:

```sh
node --import tsx --test scripts/soak/observer.test.ts scripts/soak/custody-check.test.ts scripts/soak/custody-agent.test.ts
```

If an exchange failed during seeding, the credential has no stored association: the
API refuses custody escrow while ordinary queries continue. A later successful
exchange does not authorize the external soak to change that credential. Registering
its association remains an operator action; the soak does not mutate credentials.

## Declared coverage (external mode)

`dev:demo --soak` emits 85 scenarios for ten credentials. Custody query cases are
per credential and declare a missing-association refusal where registration did
not obtain an identity. The operator does not fill expectations by hand.

Every other query is a declared scenario; intervening queries remain composed
from live discovery. Explicit undecided probes deliberately name the manifest's
columns because discovery correctly omits them. The generator adds nulls, empty
strings, Unicode, an 8192-character value, duplicate policy entities and a clear
value resembling a token. Bag comparisons preserve duplicates and ignore row
order. Expected masking follows the documented null/short-string/Unicode rules.
Two disjoint joins expect zero; the three-source joins expect 4 and 3 rows.
`open_reference` has no row decisions and returns all three rows in both pools.

The seeder also issues two **dedicated** lifecycle credentials, rotates one and
revokes the other via the normal application services. It retains the old key,
new key and grace expiry in the private manifest, never in output. The soak uses
the retiring key for a custody query inside that window and probes the revoked
key for HTTP 401 / `unauthenticated`. An elapsed grace window is NOT EXERCISED,
with its reason, not a pass; this external reader cannot reopen the window.

The summary lists every scenario, count, declared/observed outcome, and PASS,
FAIL or NOT EXERCISED. It prints the exercised fraction and all unhit IDs. A pool
restriction or short run leaves the other cases visibly unhit. Declared mismatches
raise invariant breaches with expected and actual values. Receipt-check skips and
custody completion counts remain separate; query coverage is not a claim that all
receipt checks or XQ redemptions ran. No new gate tier is registered.

The seeder preserves existing decisions and data and refuses drift, including an
already-decided column declared undecided. It never deletes an entitlement to
manufacture undecided state. Existing source data must match the generator; new
tables are inserted only when empty. These changes have not been applied by merely
editing the harness: run the operator seeder explicitly before an external soak.
