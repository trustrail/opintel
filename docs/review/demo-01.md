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

The completed-candidate full gate has not yet run. Fresh archive verification is
pending and its results will be recorded before the final gate and push.

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
