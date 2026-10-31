# DEMO-01 — ordinary source path

Branch: `feat/demo-01`. Not merged.

## Changes and preservation boundaries

Removed template source routes/contracts, industry availability, template dispatch,
reservation/retry branches, engine demo configuration and provisioning operation.
Migrations 090 and 091 convert source metadata in place, then drop the template
schema and obsolete kind/origin values. Applied migration files are unchanged.
The downgrade restores the old schema, not deleted template metadata or old source
classification; use a database backup if that metadata itself must be recovered.

No issued receipt is updated. New writes omit the synthetic column; its existing
schema default remains false. Historical synthetic/origin fields stay readable.
Both export exclusions are removed. The computed, unrecorded `demoProvenance`
export field is removed; historical synthetic receipts export normally.

The V-01 JSON moved byte-for-byte to `scripts/verification/reinsurance.json`.
The oracle, expected answers, scenarios, custody, lifecycle and receipt verification
are unchanged. The workbook generator is an internal files-only tool; it neither
lands nor registers data. All ingest implementation files are unchanged.

`./demo seed` accepts an explicit private target-URI file and fixture options,
rejecting application and readiness databases. Store the ordinary source using
`./sources add`; the soak registers through the public source API with a normal
administrator session. Its separate observer remains read-only. Installer/pairing
no longer supply demo targets, fixture settings or engine database credentials.

GATE-04: migration fixture setup has a 60-second hang guard and logs elapsed setup
in a finally block. Contributor-key targeted setup measured 2,933 ms on this Intel
host; the conversion fixture subsequently measured 2,685 ms.

## Targeted validation

Lint and strict typecheck pass. Source registration, grants, industry/engine
contracts, normal connectors, evidence writer/export, generator/ordinary ingest,
forward migration down/up preservation, historical migration identities,
provisioning runtime, installer/pairing, V-01 conformance and treatment semantics
have passed targeted runs. The generator integration lands twelve files, holds the
merged-header file and retains both versions of the restatement. The upgrade
regression compares catalogue, declarations, decisions, bindings, arrivals and
receipt records before and after conversion, including a non-null engine assignment.

## Fresh amd64 archive verification

Installed `gateway-f763975-amd64.tar.gz` and `engine-f763975-amd64.tar.gz`
from the seven audited images for `f7639755f9be63286e9b17dede50262683e84b3f`.
Later changes affect only the internal workbook generator, its tests/dependency
metadata and documentation; all resolved dependency versions remain unchanged.

- Owner email-link sign-in, second-browser device confirmation and one decline
  passed. Created the project, attached and verified the paired engine, connected
  and scanned the ordinary source through the console, configured limits, created
  the pool and row rule, issued a credential, and obtained six rows through MCP.
  Activity showed the receipt and the permanent first-receipt marker was set.
- Explicit named-database seed and engine `./sources add` used the ordinary path.
- The final internal generator delivered thirteen ordinary workbook files to the
  unchanged packaged ingest: twelve landed, one merged-header file was held with
  “The declared header row contains a merged cell.” Both restatement versions
  remain recorded; the source catalogue contains eleven physical tables.
- The packaged `./demo soak 120` passed: 83 requests (80 successes and three
  expected refusals), six custody values verified, zero invariant breaches,
  zero operational errors and zero skipped receipt-invariant checks.
  Existing scenario coverage was **12/115 (10%)**; pass status does not assert
  completeness. That known defect is recorded under VERIFY-01, unchanged here.
- The real packaged migration runner downgraded only 091/090 for a controlled
  legacy fixture, then upgraded it. Catalogue, declarations, entitlements, row
  decisions, bindings, landing registers and issued receipts compared equal.
  The converted source answered the original MCP query with the same six rows.
  A separately inserted historical synthetic receipt exported normally unchanged.

Private fixture evidence: `tmp/demo-01-acceptance-3x8Nql/browser-result.json`,
`final-verification-result.json`, per-command logs and screenshots. Those local
files include credentials or operational identifiers and are not committed.

Harness diagnostics retained: the first host-side helper needed a local transport
address while preserving TLS hostname/CA validation; after Redis restart the owner
signed in again through the real email-link flow. Optional ingest needed its
already documented `TMPDIR=/ingest/scratch` configuration, with `/tmp` still
read-only. An internal generator byte-comparison exposed ZIP wall-clock metadata;
canonical timestamps now make files deterministic without changing XML parts.
No ingest implementation, evidence record or oracle was modified to resolve these.

Archive SHA-256:

- Engine: `3cec1cb517ab03d5f5152274df8c2ef04f0f55d99d9630326d360ddbdbe1a3bb`
- Gateway: `3cfb1fc00ac5bcc0b4897dc2f2c9465ca61a7b39ede01c0bf32464c18a65205e`

The completed-candidate gate runs once after packaged verification; its outcome
is reported with the pushed commit and retained gate log.

## Native release follow-up

This host and Docker are x86_64, with 8,325,943,296 bytes of Docker memory. The
native release script requires arm64; that guard is unchanged. The approved local
verification uses amd64 archives and a two-minute packaged soak.

On the arm64 MacBook Air, fetch the pushed branch and run:

```sh
git fetch origin feat/demo-01
scripts/release/native.sh origin/feat/demo-01 --soak-seconds 120
```

VERIFY-01 owns the existing discrepancy between soak pass status and incomplete
scenario coverage. DEMO-01 records it in the backlog without changing that oracle.
