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

Full gate: pending on this candidate. No pass claimed yet.
