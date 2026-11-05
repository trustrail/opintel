# CONSOLE-04 — Stored provenance and governance vocabulary

Branch: feat/provenance, based on merged main fab72e1. No merge authorized.

## Evidence

- GET /api/v1/projects/:id/provenance/:receiptId accepts a retained receipt or release ID, declares project#view (the receipt permission), and applies the existing SQL visibility policy.
- Six ordered steps, each with recording flags and field-level gaps. Stored row decision IDs resolve immutable decision sequences and expressions; later rules are excluded. Query limits and aggregate floor come from recorded execution settings when present.
- Request identity comes from the receipt snapshot. Historical credential labels/kinds, engine identity, contributor key, column decision IDs and write-time redaction policy are explicitly not recorded where no stored snapshot exists. No current configuration is substituted. No migration or evidence write was added.
- Custody projects grant IDs, columns, times and stored state only. Redeemed means Opintel released K2; it does not establish XQ retrieval or decryption. Signed grants, shares, provider locators and tenant identifiers are excluded.
- Audit receipts link to provenance. Entitlements has a pool Custody tab linking retained releases; Home links the latest retained release. Release discovery reads existing receipt pages and details with bounded four-request fanout; cost grows with retained receipt count.
- Catalog, Entitlements and Audit replace navigation labels; existing screen/API/database names remain stable. Rail items have glossary tooltips; column decision headings say Classification. Contributor-key guidance uses Catalog.

## Validation

- test/activity.test.ts and test/aggregate-contributor.test.ts: 21 passed. New tests cover historical gaps, permissions/project isolation, refused causes, custody/release-first equivalence and private-field exclusion, ordered API contract, and historical row decision preservation.
- Console tests: 173 passed, including provenance expansion, copy controls, governance navigation destinations, and Home's latest-release link.
- Strict typecheck and repository lint passed.
- Production-preview capture: passed, zero page errors or HTTP failures, real API/isolated database/fixture administrator/local custody. Not cloud or live-XQ acceptance.
- No new CSS class or stylesheet change. Existing dialog, scroll, field, badge, identity, treatment and copy patterns reused.

## Screenshots

[Request desktop](provenance/request-1440-light.png) · [Custody desktop](provenance/custody-1440-light.png) · [Request phone](provenance/request-390-light.png) · [Custody phone](provenance/custody-390-light.png). Capture scripts and metadata are committed with these results.

## Limits and inference

Step recorded=true means at least one fact is recorded; each missing fact remains recorded=false. Missing retained receipts return not found. Provenance does not claim complete read-column lineage beyond the stored objects and delivered element records. Current grant lifecycle state is shown alongside its recorded release time. The historical credential label is deliberately not replaced by today's label.

## Single full gate — failed before conformance scenarios

`npm run check` ran once on `9d167f1`, exit 1, total 736.082 s.
Preflight, strict typecheck, conformance typecheck, lint and production artifact
passed. The conformance container installed dependencies (npm reported 6 minutes),
then Playwright reported: `Error: Timed out waiting 120000ms from config.webServer.`
Conformance tier elapsed 593.662 s. Coverage: **0/30 routes visited**; zero findings
is incomplete coverage, not a pass. Normal tests and smoke were not reached.
Cleanup passed. No retry or timeout change was made.

The retained gate metadata reports minimum host available memory 815,968,256 bytes
at 2026-11-05T14:53:37.510Z. That observation does not establish the timeout cause.
The production-preview screenshots and targeted checks above passed separately;
they do not replace the failed gate. The known smoke deadline exception does not
apply to this startup failure.

[Gate metadata](provenance/gate.json). Full log:
`/private/tmp/provenance-gate-9d167f1.log`. Stopped, not merged.

## Authorized standalone conformance diagnostic

The owner authorized conformance alone with web-server startup logging, followed
by one smoke run if routes passed. The diagnostic script temporarily pipes
Playwright web-server stdout/stderr and restores its config byte-for-byte;
command, assertions and 120-second startup bound are unchanged.

Result: **40 passed; 30/30 routes visited; zero distinct findings**. Vite reported
`built in 1m 13s`; the preview server started within the existing deadline. No
build or route-registration error occurred, including the provenance and pool
Custody routes. The earlier startup timeout did not reproduce; its root cause
is not established. This does not retroactively claim the full gate passed.
The startup log and conformance JSON are retained beside this report.

The authorized smoke invocation then failed: `Test timeout of 30000ms exceeded.`
Playwright reported 35.6 s including cleanup, followed by
`MCP error -32000: Connection closed` during fixture teardown. This is the same
deadline/cleanup symptom previously recorded on this Intel host; the underlying
cause is not established by this run. No additional smoke retry, full gate,
product change or timeout change was made. Normal tests remain unrun by the
original full gate. Smoke log: `/private/tmp/provenance-smoke-once.log`.

Conclusion: conformance startup succeeded on the standalone invocation; no build
or route-registration defect was found. The original 120-second startup timeout
is non-reproduced, not proven environmental. Standalone smoke remains failed.
