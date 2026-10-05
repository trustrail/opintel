# Development demo bootstrap

`npm run dev:demo` prepares the local data services and sidecar, then seeds a
stable development user, company and reinsurance project. It uses the existing
demo preparation/connection, pool-key, binding and bulk-entitlement services.
It initializes query limits and token declarations, preserves existing decisions,
and prints a new pool key once. It does not start a second API process.

The default decisions tokenize treaty references, alternate currency masks and
withholding, restrict inception dates to aggregation, and expose supported
landing provenance clearly. Unbounded numeric premiums remain unsupported and
withheld; the script does not override catalog type mapping.

Two live-query prerequisites were found during verification:

- Refresh statistics for the demo's landing schema through its existing write
  scope. Fresh tables otherwise have unknown scan size and correctly refuse.
  This maintenance is explicit bootstrap work; queries remain read-only.
- Wire sidecar tokenization to the configured custody resolver. Connection
  already initialized custody, but startup had selected environment secrets for
  tokenization. The existing resolver honors the version pinned by the run.

The development guard runs before mutations. Local runs serialize with a lock.
After a metadata volume wipe, configuration for destroyed projects and obsolete
fixture reservations is backed up and retired; landing files and registers stay
intact. Other existing projects' zones, including prepared reservations, remain.
`dev:up` retains its existing stale-zone diagnostics.

## Verification

- Live local provisioning connected the demo source and created its pool/key.
  The completed fixture has 11 aggregate-only, 55 clear, 6 masked, 11 tokenized
  and 16 withheld decisions.
- Live MCP: explain, the printed tokenized/masked sample query, and
  `COUNT(inception_date)` succeeded. A raw inception-date read was refused.
- Rerun comparison: sources, pools, key records, bindings, entitlements, arrival
  notices, landing receipts and bulk decisions were unchanged; no key reprinted.
- Final full suite: 123 files, 1,299 tests passed (452.91 seconds).
- Final isolated demo/landing suites: 3 files, 15 tests passed (9.73 seconds).
- Strict typecheck, lint/boundary checks and `git diff --check` passed.
- No existing database volume was destroyed during verification. Stale-project
  retention and retirement are covered by the development guard tests.

Fresh `dev:demo` provisioning registers the source as **Reinsurance**, giving it the catalog alias `reinsurance`. Its physical landing schema remains the generated `demo_<sourceId>` schema. There is no administrator control for assigning an exposed schema name, so that component remains generated rather than being changed to `public` for presentation.

An existing provisioned demo keeps its current alias: aliases are immutable by design, and rerunning the bootstrap does not rename them. Fresh provisioning is required to see the readable alias.
