# Authentication and contextual Data console review

The console phase is on **feat/console-auth-source-panel** and is not merged. The prior console-default merge was pushed to main as **c7f57fe7884f88d6b89b48312896c3e3d91ba3d3**, without repeating its gate.

**Full-gate status: failed once on 39a110e.** One generated OpenAPI document was stale; it is now regenerated and all 20 affected contract tests pass. The full gate was not rerun, and its final browser/MCP smoke tier did not run. The independent fresh packaged verification below passed.

## Implementation and backend scope

Console-next now serves sign-in, check-email, device confirmation and authentication outcomes, the scoped Data source panel, inline declarations and contextual observation destinations. It uses React, the shared Radix primitives, regular Phosphor icons, Motion, visx and packaged Inter. The legacy Observations destination is removed; resolved observations remain in the API and evidence exports. Advanced column tags and source administration remain explicitly under the frozen legacy prefix.

The only backend correction approved for this phase is the timezone adaptation in **0abe4beaf81b321143b84c43f5e4349671f0835d**. One shared [engineTokenDeclaration conversion](../../src/shared/execution-contract.ts) maps the application declaration sourceTimezone to wire declaredZone. Query and row-preview preparation both call it. Compiler metadata and receipt declarations retain their existing application names. The engine tokenizer's strict schema and source reader are unchanged; unknown token fields still fail validation. No migration, grant, permission or new endpoint was added.

The [wire contract regression](../../test/execution-token-contract.test.ts) accepts declaredZone, rejects sourceTimezone and unknown fields, and preserves absent zones and epoch units. The [real read-plan regression](../../test/staging-source.test.ts) compiles a tokenized TIMESTAMP with America/New_York, serializes the engine request and executes through the PostgreSQL source reader, tokenizer and staged DuckDB path. Its token matches the equivalent UTC TIMESTAMPTZ, while plaintext is absent from staging.

Screenshot review also corrected stale affected-pool metadata after treatment changes, the shared confirmation form layout, editor visibility while confirmation is open, readable member names and singular/plural counts. A console regression covers refreshing the cached affected-pool count.

## Existing endpoints and destinations

| Area | Existing wiring |
| --- | --- |
| Authentication | GET /api/v1/auth/providers; POST /api/v1/auth/request-link, /auth/callback and /auth/confirm-device; GET /api/v1/auth/me. Provider discovery, enforced SSO, administrator recovery, device nonce and safe local return-to reuse the existing services. Owner claim and invitation acceptance retain their existing magic-link completion. |
| Scans | Project source introspection list and project introspection detail; POST /api/v1/sources/:id/introspect and project introspection cancel. Running scans poll progress; Cancel is admin-only and confirmed. |
| Engine assignment | PATCH /api/v1/projects/:project/sources/:source/engine. |
| Filings | Existing project filings and observation groups/members. Held filings sort first; recorded failures, restatements and safe copyable identifiers are shown when present. |
| Declarations | Existing catalogue element GET/PUT declarations and source/schema GET/PUT declarations. The default timezone is explicitly source-and-schema scoped, matching the API. Hidden canonicaliser settings are preserved. Server refusals remain visible; token-changing edits require the exact project name when the server requires it. |
| Contextual observations | Existing open groups become held-filing Needs-you/source destinations, unsupported column marks and a Data filter, or backup verification in Settings Token key with red custody health. |
| URL compatibility | Legacy auth paths redirect to console-next. Source scan, declaration/schema, type-observation and custody-observation links preserve their scope and open the new inline destination. The account menu links Held filings to its owning source and has no Observations page entry. |
| Activity | Existing Activity data; the Right now ring fits its parent in light mode. |

## Fresh packaged installation

**Passed.** Verification used fresh gateway and engine archives, new state volumes, real HTTPS, TLS SMTP, external customer PostgreSQL and MCP. There were no mocked API responses or development-server application assets. Only synthetic customer fixtures were changed.

Console image source: **ec3400d0cd36fe8acdeb06a49a61f84296dddbed**. The six unchanged backend images are from **0abe4beaf81b321143b84c43f5e4349671f0835d**. Assembly checked that intervening changes were console or verification files and that upstream, platforms and compatibility identities matched. Each image's source revision is recorded in the [assembly manifest](console-auth-source-panel/image-assembly.json). Both linux/amd64 archives were hashed before installation: [archive hashes](console-auth-source-panel/archive-hashes.json).

The passing installation is tmp/console-auth-source-acceptance-vMeYFQ. See the [safe installation result](console-auth-source-panel/install-result.json) and [browser result](console-auth-source-panel/browser-result.json). The browser reported **zero page errors**.

| Requested verification | Result |
| --- | --- |
| Install both archives, one-code pair, add engine references | Passed |
| Email link in a second browser and confirm device | Passed |
| Decline a separate link and remain unauthenticated | Passed |
| Create project and atomically register the sole paired engine | Passed |
| Verify engine; connect, test, register and scan source | Passed |
| Set project limits; create pool and row rule; make a treatment decision | Passed |
| Issue credential; agent request; first receipt in Activity | Passed, six rows answered |
| Permanent first-receipt marker and tracker disappearance | Passed |
| Scan unsupported PostgreSQL type and a breaking type change | Passed |
| Contextual type-observation and scan legacy links | Passed |
| Decide a reset column through existing entitlements | Passed |
| Quarantine a real merged-header workbook | Passed |
| Needs-you opens the owning source; copy operator packet | Passed; clipboard matches the safe packet, with no filename or file content |
| Schema declaration legacy link and All tables navigation | Passed |
| Contributor key, schema UTC default and epoch milliseconds | Passed through console |
| Isolated domains produce distinct tokens | Passed |
| Shared domain across two tokenized columns; exact project confirmation | Passed; all six row pairs match afterwards; displayed counts are one affected pool and two columns |
| Unverified backup shown on red custody health, Needs-you and Token key Verify | Passed |
| Old custody-observation link; restore and reverify backup | Passed; resolved observation retained |
| Account menu held-filings destination | Passed |
| Enforced provider screenshot | Passed using a fixture company/provider through the real discovery API; no external IdP sign-in was attempted |
| Light Activity Right now ring | Passed: 142.5 by 142.5 px, inside its parent |

The operator action prepares and copies the existing packet for the operator to carry; it does not transmit a message to another person. The SSO screenshot fixture creates an enabled provider before enforcement and respects the existing database constraints. Historical failed harness and pre-fix review evidence is kept separately; it is not the final proof.

## Screenshots and remaining differences

Each link below places the approved image on the left and the final packaged screenshot on the right. All actual captures rendered in self-hosted Inter, confirmed through CDP font inspection. Desktop captures are 1440 px; image 25 is 390 px. No retired browser baselines were recaptured.

Common foundation differences: the existing five-size type scale uses a 48 px desktop story heading and 24 px auth title, rather than the reference's 40/32 px; shared icons use regular outlines, including the brand mark. Shared focus styling is visible. Real names, counts, dates and available providers replace illustrative values. Human design review remains necessary.

| Image | Side-by-side screenshot | Remaining differences |
| --- | --- | --- |
| 20 | [Approved beside packaged](console-auth-source-panel/20-sign-in-comparison.png) | The fixture email is shown. Google and Microsoft are absent because neither is configured; the form is therefore shorter and vertically centered at a different position. |
| 21 | [Approved beside packaged](console-auth-source-panel/21-enforced-sso-comparison.png) | The configured fixture provider is Company SSO on review.invalid rather than the illustrative Okta provider/domain. Administrator recovery remains available. No live external IdP exchange is claimed. |
| 22 | [Approved beside packaged](console-auth-source-panel/22-check-email-comparison.png) | The fixture email replaces the sample address. Shared regular icons are used for browser, device, one-use and resend actions. |
| 23 | [Approved beside packaged](console-auth-source-panel/23-confirm-device-comparison.png) | Shared shield/check icons, shared title sizing and focus styling replace the sample icon styling; the confirm/decline workflow is unchanged. |
| 25 | [Approved beside packaged](console-auth-source-panel/25-phone-sign-in-comparison.png) | 390 px capture uses the real email and no unconfigured provider rows. The shared 24 px phone heading makes the dark story header slightly shorter than the sample. |
| 26 | [Approved beside packaged](console-auth-source-panel/26-source-scans-comparison.png) | Real two-scan history, four recorded changes, two tables and one pool replace sample counts/history. There are no invented failed or running scan rows. The shared scope picker is larger, dates are absolute UTC, and the band labels its decision scope explicitly. |
| 27 | [Approved beside packaged](console-auth-source-panel/27-source-filings-comparison.png) | There is one real merged-header hold and no landed data or restatement in this fixture. The unavailable Landed table/row panel and pool-use badges are hidden. After Copy, the safe packet textarea and carry-it-yourself confirmation are visible; the reference shows the pre-copy state. |
| 28 | [Approved beside packaged](console-auth-source-panel/28-declarations-comparison.png) | The real table has one pool and different columns, including the unsupported type. Four open decisions sort first. One group contains two columns. The source-and-schema timezone scope is explicit; ignore-case uses the shared Radix Checkbox treatment rather than a Switch primitive. The sample footer legend is replaced by the existing per-chip kind/tooltips. |
| 29 | [Approved beside packaged](console-auth-source-panel/29-token-change-comparison.png) | The shared dialog is centered in the viewport, rather than offset within the workbench. It shows one affected pool as a count because the declarations read supplies that count; illustrative C1/C2 badges are absent. Before/after descriptions include case behavior, with full values on hover. The project name is entered by the verifier, not prefilled by the application. |


[All nine comparisons](console-auth-source-panel/comparisons.png). [Activity ring proof](console-auth-source-panel/activity-ring-unclipped.png).

## Validation and gate evidence

- Strict typecheck and unchanged lint passed.
- 113 console tests passed across 11 files, including the affected-pool metadata regression.
- 50 targeted tests passed across five files: the wire contract, real staged source regression, MCP query, row-preview sealing and provisioning runtime checks.
- Earlier route/static/backend contracts and control conformance passed; the completed-candidate gate rechecks the active gate tiers.
- All package images passed secret and runtime-content audits.

The single completed-candidate **npm run check** ran on **39a110e804d17f1d9a115fd215b295d91bc045cb**, taking 2,184.97 seconds. Preflight, both strict typecheck tiers, lint, production-artifact exclusion and control conformance passed. Conformance visited 32/32 routes with zero findings.

The normal tier reported **2,275 passed and one failed test** across **276 passed and one failed file**. The failure was test/sidecar-http.test.ts, in the OpenAPI-document equality assertion: the generated shared schema used declaredZone while the checked-in sidecar/openapi.json still used sourceTimezone in three request schemas. This was a missed generated contract update, not an environment or runtime-tokenization failure. The new timestamp read-plan regression and wire-shape tests passed inside this gate.

The document was regenerated with the repository command, changing only those three field names. JSON syntax and lint passed; all **20 tests** in sidecar-http and execution-token-contract then passed on an isolated database. No runtime code or validation assertion changed in this follow-up.

The full gate was **not rerun**, and its browser/MCP smoke tier was skipped after the normal-tier failure. The separate fresh packaged browser/MCP verification above passed all 25 recorded steps. A green full-gate result is not claimed. See the preserved [original gate record](console-auth-source-panel/gate-result.json) and [targeted correction record](console-auth-source-panel/post-gate-contract-check.json). The private full log remains /private/tmp/opintel-auth-source-full-gate.log.
