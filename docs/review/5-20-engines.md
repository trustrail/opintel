# 5.20 — Single-tenant engine registry

The application dials operator-registered private HTTPS engines. Registration
records the address and SHA-256 certificate pin without approving use. A pinned,
mutually authenticated health check must report contract 2 before source
assignment. Editing the registration requires verification again; a concurrent
edit cannot inherit an in-flight check's approval. Health is the last observed
check, not a continuous monitoring claim.

Sources route through their project-owned engine assignment. Missing assignments
name the source in the refusal. Introspection, validation and execution recheck
the selected engine; queries spanning engines refuse rather than pretending to
provide distributed execution. The registry has tenant policies and a composite
project/source/engine constraint. Receipt authentication binds the certificate pin
to the claimed project and assigned source before accepting the receipt.

One verified engine is designated for project custody. Assigning a source with
tokenized entitlements requires its engine's current primary key version and
sentinel to match the application record. Tokenized dispatch repeats the check;
the tokenizer independently compares the actual loaded key's sentinel before
producing tokens. A stale engine can continue clear-only execution. Attestation
does not initialize keys or consult escrow. Distribution and coordinated rotation
are separately recorded as 5.21; provisioning remains customer-owned.

`APPLICATION_TLS_CONFIG` replaces the application's old single-engine client
configuration. Its strict schema permits only `caFile`, `certFile`, and `keyFile`:
the application's trust material, certificate and private-key paths. No address,
engine pin, timeout, source assignment or custody selector remains there. Receipt
bind host/port are separate deployment settings. The receipt listener, development
tools, demo provisioning and tests have been explicitly migrated. Production
routing has no legacy fallback. Standalone transport fixtures obtain their
explicit engine deployment from `service.json`; development operator tools
register that deployment in the registry before application operations.

Existing sources migrate with no assignment. An operator must register and verify
their engines, designate custody and assign sources. Certificate/trust distribution
is internal customer provisioning; private keys are never stored in the registry.
The multi-tenant outbound connection proposal remains considered and not chosen
in `deferred.md`.

Validation:

- Strict typecheck, lint/boundary checks and production build passed.
- Full unit/integration run: 1,487 passed, three assertions failed and one
  cleanup hook timed out. The two introspection assertions exposed an incorrect
  unreachable flag and were fixed. A serial rerun of all three affected files
  plus the registry suite passed all 62 tests, without changing timeouts or
  weakening assertions. The CSV and cleanup timeouts did not recur.
- Complete bypass gate: 97 passing checks, zero open checks, zero regressions.
- Linux functional browser suite: 106 passed.
- Linux Settings/source snapshots and engine accessibility/verification states
  passed at 390, 900 and 1440; final engine checks passed all five scenarios.
- Migrations 057–058 applied to development and test databases; the rollback-only
  down/up test passed and asserts no source assignment is invented.
- Shared Zod schemas generated all five engine API paths successfully.
- Reader inventory search across source, engine, scripts and tests found no
  `client.json`, `SIDECAR_CLIENT_CONFIG`, `LANDING_RECEIPT_CLIENT_CONFIG`, or old
  loader reference.

The S4 container ephemerality harness was not rerun for this item; this report
makes no new memory-erasure claim. The added tokenizer guard is tested to refuse
before tokenization work and retains the existing key-disposal finally block.
Full Linux browser control conformance passed: 181 scenarios, all 51 screen
routes visited, zero distinct findings.
