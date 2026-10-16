# Custody revocation and redemption evidence — approved positions

Version: 1.5 — 2026-10-15.

Latest decision: no custody product defect established. Gate unblocked with one full throwaway browser warm pass as a stated precondition. Custody commits precede the separately validated production-build harness change. The 390 timing correlation is an open question, not a blocker.

2026-10-15. Items 5.36/5.37. **Approved by Rick on 2026-10-15; implementation in this batch.** The separate escrow-refusal regression tests do not change these behaviors.

## 1. Credential revocation

Before this approval, code deliberately sequenced credential revocation after remote acknowledgements: `ReleaseRuntime.revokeInScope` says “Apply local changes only after every remote acknowledgement succeeds.” It returns “The credential was not revoked” on failure. `PostgresPoolKeys` invokes that hook before revoking the credential and its keys. The credential migration position says revocation ends its alias and live grants. This supplies a consistency rationale: do not report that whole operation complete while provider access remains. It is an explicit implementation choice, but the position does not expressly approve keeping local authentication live during a provider outage. That security tradeoff must not be presented as an already-reviewed decision.

Individual grant revocation in `ReleaseService.revoke` does the opposite: delete K2, record the revocation, and retain pending provider cleanup. The code comment explicitly requires local refusal to commit even when the provider is unavailable. The two operations had different success contracts.

**Approved: local-first credential revocation.** In one local transaction revoke the credential and all current/retiring key versions; delete remaining K2 shares for all affected aliases (including migrated legacy aliases); record immutable revocation events and durable pending provider cleanup. Reject subsequent authenticated requests and K2 redemption. Report “Credential revoked locally · provider cleanup pending” until acknowledgements arrive. Never report complete remote revocation prematurely. Apply equivalent local revocation to future scope grants when implemented.

What would break if only the order were changed: existing all-or-nothing response semantics and lifecycle tests; cleanup could be lost unless revoked credentials' grants remain discoverable by the sweeper; already `redeemed` grants also need pending cleanup because their K2 has already left Opintel. Retain original provider/tenant/locator routing, idempotency and retries, and fence concurrent query issuance/redemption with the existing project release lock. A request authenticated before revocation must not issue a new grant after the revocation transaction. This requires implementation review, not merely moving the remote call below the database writes. Local-first cannot promise to cancel plaintext already in flight or recall shares already obtained.

A stale provider alias alone cannot authenticate to Opintel: the pool key is checked locally, and `agentId` is self-declared. However, an attacker with an XQ token for that alias may retrieve an outstanding K1 while remote cleanup is pending. If they already obtained K2 before local revocation, they can then decrypt an already-delivered sealed result. If K2 was still held locally and is destroyed atomically, stale K1 alone cannot decrypt it. This is why cleanup must include grants whose state is already `redeemed`. Alias registration itself is not proof of session possession or independent agent identity.

Sources: `src/modules/release-custody/infrastructure/runtime.ts` (`revokeInScope`, `retireLegacyAliases`), `application/service.ts` (`redeem`, `revoke`, `sweep`), `src/modules/pools/infrastructure/keys.ts`, and `docs/review/row-scoping-design-position.md` credential migration section. Remote-first provider configuration changes are a separate decision, not implicitly changed by this recommendation.

## 2. What redemption proves

`ReleaseService.redeem` commits deletion of K2 and an immutable `redeemed` event before returning the share. It proves Opintel authorized and committed a one-time release of its share for the authenticated credential alias. It does not prove response delivery to the agent, K1 retrieval, key reconstruction, decryption or use of a value. A connection can fail after the commit. Provider observations are a separate `provider_redeemed` event; even both events do not prove decryption.

**Approved visible name “Opintel share released”, with K2 explained once.** Receipt wording: “Opintel share released at <time> for credential <alias> · request origin <origin>.” Supporting text: “Opintel committed the one-time release of its key share (K2). This does not confirm client receipt or decryption.” Before that event: “Opintel share not yet released.” Provider event: “Provider-reported share retrieval at <time>”; absent corroboration: “Provider retrieval not corroborated.” Never infer provider success from the local event or label it “decrypted”. Keep “Released under custody” as the treatment name and distinguish sealed-result delivery from share release.

This preserves the strong claim we actually prove: authenticated, atomic, single-use K2 release, with immutable timestamp, credential alias and observed request origin. Do not weaken it to a mere attempt. Keep existing immutable event values (`redeemed`, `provider_redeemed`) and state values for compatibility; publish their precise semantics in API/export documentation and map presentation labels. A future wire rename needs versioning, not historical evidence rewriting.

### Surface inventory and proposed disposition

| Surface | Current source / finding | Proposed change after approval |
|---|---|---|
| Console receipt and actions | `src/app/activity/detail.tsx`: “redeemed”, “not redeemed”, “Revoke unredeemed access”; shared `ReleaseReceiptLines` | Apply explicit K2 labels; “Revoke remaining release access” with no-recall explanation |
| Console rollup | `src/app/activity/screens.tsx`: counts by `granted/redeemed/expired/revoked`, origins counted from `redeemed` | Label redeemed count “Opintel shares released”; origins are K2 request origins, not locations of decryption |
| /next Activity | `src/app/next/screens.tsx`: uses shared receipt detail; empty-selection help says “revoke any unredeemed custody access” | Same semantics; change help to remaining release access |
| Decision/preview help | `src/app/entitlements/row-editor.tsx`, `src/app/next/decisions.tsx`: redemption references | Preserve distinction between Engine-local preview and live provider redemption; no preview presented as redemption evidence |
| Receipt/API | `src/shared/release-contract.ts`, `src/shared/api/activity.ts`, `src/shared/api/mcp.ts`; `opintel.redeem` and release events | Keep wire names, document committed K2 release and separate provider observations; no “agent received/decrypted” inference |
| Evidence reads/exports | `src/modules/evidence/infrastructure/read.ts`, `export.ts`, `src/shared/api/evidence-export.ts` and application export serialization | NDJSON contains release events; CSV contains them as nested JSON in `releaseEvents`. Include an event-semantics legend in accompanying documentation, preserve original events and timestamps |
| Recorded design | `docs/review/custody-design-position.md` receipt lines/rollup and corroboration sections | Replace ambiguous presentation wording only after approval; retain first-hand versus provider-observed distinction |
| Receipt evidence boundary note (formerly integration brief) | `docs/review/custody-receipt-evidence-boundary.md` says “records the authoritative redemption” and later “First-hand K2 receipt events” | Replace the ambiguous first phrase with “records the authoritative, one-time K2 release commitment”; explicitly not proof of receipt or decryption |
| Refusal copy catalogue | `docs/5-8-model-text.md` and `ReleaseService` say a grant may be “already redeemed” | Clarify “its Opintel share has already been released” in human-facing refusal copy; preserve refusal code and wire compatibility |
| Partner brief and deck | No separate partner brief or deck artifact found in repository inventory (including Markdown/HTML/PDF/PPTX filenames). The integration brief above is not assumed to be the partner brief | Review remains incomplete for those artifacts until their location/content is provided; search for “redeemed”, “received”, “decrypted”, “accessed” and any assertion of proof of use |

The proposal above was approved. Console, API, receipt/export and integration-brief changes are implemented below. Rick and the user own the external deck and partner brief. Baselines remain unchanged; the gate is explicitly deferred.

## 3. Escrow refusal regression boundary

Add tests at the real XQ worker HTTP boundary for HTTP 412 with the captured `transfer/data` body, connection failure and an actual request timeout. Drive a normal MCP query through Engine sealing and the durable evidence writer; assert the entire refusal response, absence of all result values (including a clear sibling column), no release grant, and a persisted refused receipt with no released elements. Mock only the provider HTTP peer and route the fixture's escrow to the real XQ adapter; never contact XQ or change production timeouts. Run affected tests only.

Implemented in `test/release-custody-escrow-refusal.test.ts`. Affected command `npm test -- test/release-custody-escrow-refusal.test.ts` passed **3/3**, one file, **27.85s** (test execution 23.47s). HTTP 412 uses the captured body verbatim; the network case closes the socket; the timeout case leaves the request unanswered for the real worker deadline. Each asserts the complete MCP refusal, an executed Engine query, no structured result or exposed sample values, a committed refused completion and refusal stage, no released/aggregated evidence elements, and no release grant/events. No full gate, typecheck/lint suite, baseline, live XQ call, commit or push was run for this task.

## Approval and implementation record

Rick approved local-first revocation: a stale provider alias cannot authenticate to Opintel, while remote-first adds a provider-outage failure mode that leaves the credential live. Both approaches share the residual risk from shares already obtained; local-first does not claim immediate removal of a still-retrievable remote share. Outstanding K1 plus previously released K2 remains the documented cleanup-window risk.

The chosen visible wording is “Opintel share released”. “Committed” is a database operation, not a defined event-vocabulary label. Every presentation of the released-share claim carries: “This does not evidence that the agent obtained the provider's share or decrypted the value.” Existing `redeemed` wire/event values remain compatible and carry an explicit evidenceMeaning in API receipt/read outputs and CSV/NDJSON exports. Historical database events are not rewritten. The deck and partner brief are outside this repository and are owned by Rick and the user.

Credential revocation now commits local key revocation and K2 deletion without making a remote call, preserving pending cleanup in the existing grant/event ledger. Already-redeemed grants retain their state and gain a revocation event. All legacy key aliases are included. A grant whose escrow completes after local revocation is persisted as revoked with no K2, never delivered, so its remote locator remains discoverable for cleanup. Pool inspection exposes pending cleanup counts. No new migration is needed.

The export regression test led to a correction of the earlier source audit: `EvidenceExportRecord` included release events, but the export SQL did not select them and therefore defaulted to an empty list. Export reads now use the same release-event projection as receipt detail. Both formats are tested with an actual persisted release event. This is an additive read/export correction; it does not modify evidence.

Cleanup after an issuance/revocation race is owned by the durable sweeper, which records acknowledgement. The refused query does not perform an unrecorded immediate revoke that could leave a successfully removed locator appearing pending forever.

## Validation boundary for the approved implementation

Affected backend coverage comprises 108 unique passing tests across credential-local-revocation, pool-credentials, release-custody, release-custody-mcp, release-custody-escrow-refusal, evidence-export, mcp-response and xq-integration. These passed across focused iterations, not one full-suite invocation. Focused iterations corrected a syntax error, an export fixture's missing user, a local-provider fixture's missing agent header, and the exact-message catalogue; these were not gate runs. The final source also covers a previously acknowledged remote cleanup: revocation still records the credential's revocation event without erasing the earlier K2 release or inventing pending cleanup.

Browser validation used the pinned Linux image `mcr.microsoft.com/playwright:v1.63.0-noble` / Chromium 153.0.8010.12 because the matching native browser does not support this host's macOS 13. The functional 900 and 1440 receipt/action/accessibility checks and empty-state check passed. The first 390 attempt exhausted its 30-second test budget with “Preparing this view”. An isolated diagnostic recheck at the same timeout failed during `page.goto`, before custody assertions. Its trace records 12.117s for the HTML request and unfinished Vite React modules when the test ended. This is an observed cold browser/dev-server loading limitation, not a green 390 result; no timeout, retry setting or tolerance was increased. Logs: `tmp/custody-local-browser-docker.log`, `tmp/custody-local-browser-390.log`; trace: `test-results/release-custody-5-36-custo-12afe-on-and-accessibility-at-390-functional/trace.zip`.

No gate, visual snapshot project, baseline regeneration, live XQ request, commit or push. External deck and partner-brief changes remain with Rick and the user.

The final revocation/test-agent check passed 21/21 in 20.94s (`tmp/custody-local-final-edge.log`). The corrected export and cleanup-count check passed 11/11 in 43.82s (`tmp/custody-local-corrections.log`); the exact-message check passed 60/60 in 4.03s (`tmp/custody-local-wording-tests.log`). The other affected custody suites passed in the preceding focused runs. No full-suite/gate result is claimed.

Final `npm run typecheck`, `npm run lint` and `git diff --check` passed. Typecheck and lint ran sequentially; logs are `tmp/custody-local-typecheck.log` and `tmp/custody-local-lint.log`.

## Follow-up verification

### Export omission scope

Both CSV and NDJSON evidence exports omitted **all release events**, not merely K2-release events. The export SQL omitted the projection and the detail schema defaulted `releaseEvents` to `[]`. The defect began when custody events were introduced in `97a42b8` (2026-10-12) and persists through committed HEAD `b1da401` (2026-10-14); the correction is currently uncommitted. Before custody existed, there were no release events to omit. Stored events and the receipt-detail query were not affected.

Dedicated cases in `test/evidence-export.test.ts`: `ndjson evidence export must not silently omit persisted release events` and `csv evidence export must not silently omit persisted release events`. Each seeds all five event kinds and checks the actual downloaded output for every kind and grant/receipt identity. A controlled removal of only the SQL projection made both cases fail with `[]` instead of the five stored events (2 failed, 7 skipped, 6.63s; `tmp/custody-export-red.log`). The projection was immediately restored before the green run: all 9 export tests and the exact-wording test passed (10/10, 18.47s; `tmp/custody-export-green.log`). The dedicated regression therefore fails without the fix and passes with it, independently for CSV and NDJSON.

The XQ integration agent writes its own JSON/Markdown treatment report under `tmp/review/pool-agent/`; it does not call the evidence-export API and is unaffected by this SQL omission. Any CSV/NDJSON evidence export downloaded through the affected API during XQ testing omitted any release events that existed for its runs. No such downloaded artifact has been identified in the available repository files; that is not proof no external download occurred. Refused escrow queries create no release grant/events, so their empty event arrays were truthful.

### Exact wording audit

Canonical non-claim, including punctuation and ASCII apostrophe:

> This does not evidence that the agent obtained the provider's share or decrypted the value.

Runtime source: `releaseNonClaim` in `src/shared/release-contract.ts`. Dynamic timestamps, aliases and counts are evidence fields surrounding the label; they do not alter the non-claim.

| Surface | Exact label / evidence statement | Exact accompanying non-claim |
|---|---|---|
| Console Activity rollup | Opintel share released | This does not evidence that the agent obtained the provider's share or decrypted the value. |
| Console receipt, also shared by /next | Opintel share released | This does not evidence that the agent obtained the provider's share or decrypted the value. |
| Receipt API `releaseEvents[].evidenceMeaning` and summary API | Opintel released its share of the key. | This does not evidence that the agent obtained the provider's share or decrypted the value. |
| MCP redeem output `evidenceMeaning` | Opintel released its share of the key. | This does not evidence that the agent obtained the provider's share or decrypted the value. |
| MCP tool description | Opintel share released on successful redemption of a single-use grant. Requires the credential named by the grant. | This does not evidence that the agent obtained the provider's share or decrypted the value. |
| CSV nested `releaseEvents` JSON | Opintel released its share of the key. | This does not evidence that the agent obtained the provider's share or decrypted the value. |
| NDJSON `releaseEvents[].evidenceMeaning` | Opintel released its share of the key. | This does not evidence that the agent obtained the provider's share or decrypted the value. |
| Custody receipt evidence boundary note | Opintel released its share of the key. | This does not evidence that the agent obtained the provider's share or decrypted the value. |

The note's curly apostrophe was corrected to the canonical ASCII apostrophe. No event codes or stored events were renamed.

### Initial isolated browser follow-up — interpretation superseded by the reverse-order test below

Before isolation, `lsof -nP -iTCP -sTCP:LISTEN` showed Vite PID 70076 on 5173, Engine PID 87929 on 3100, and API PID 96389 on both 3000 and 3101. Process ancestry identified the latter as the dev API under its watcher, not a separate stray server. These processes and the API watcher were stopped. Before each isolated invocation the Node-listener query returned no process rows. Database/Redis/SpiceDB infrastructure remained idle; no other validation command ran concurrently.

Each width uses a fresh pinned Docker invocation, one worker, zero retries and the original 30-second deadline. The receipt runs `prepareCapture` (data readiness, fonts, animation settlement and fresh paint) without taking or regenerating a snapshot. Separate trace/log artifacts are under `tmp/custody-isolated-{390,900,1440}` and the corresponding `.log` paths.

390 failed alone in 37.2s (including timeout cleanup), so the earlier report does **not** establish host load as an explanation. Its first full-page navigation took 19.163s, the receipt heading another 4.035s; settled paint and revocation passed before the second full-page navigation exhausted the test budget. Trace requests included `/@vite/client` at 14.632s and React DOM at 10.844s. 900 also failed alone in 31.4s: first navigation 16.380s, second navigation 7.302s, then axe injection/evaluation. The fault is reproducible in the cold application-loading test path at more than one width, not evidence of a 390-specific layout or revocation failure. No assertions, timeout, retries or scenario coverage were relaxed. 1440 passed alone in 24.8s (48.8s Playwright invocation); its navigations were 7.759s and 3.662s. These comparisons do not demonstrate a custody-layout-specific cause: Vite module loading is materially slower in the failed runs before the custody controls render. The immediate failure mechanism is cold startup/full-page navigation consuming the shared test deadline. The underlying reason for the Vite latency variation has not been causally isolated, so this remains an unresolved test-path defect, not an excused host-load failure.

| Width | Scenario duration | Result | First / second navigation |
|---|---:|---|---|
| 390 | 37.2s | Failed at second navigation | 19.163s / timed out |
| 900 | 31.4s | Failed at end of accessibility work | 16.380s / 7.302s |
| 1440 | 24.8s | Passed | 7.759s / 3.662s |

The requested gate and commits are blocked by this outstanding defect: AGENTS.md explicitly says never to run a full gate with a known defect outstanding. No baseline capture, commit or gate was run.

Final focused verification after separating export-presence assertions from wording assertions: 10/10 tests passed in 19.78s (`tmp/custody-export-final.log`). Typecheck, lint and `git diff --check` passed. Export omission coverage no longer depends on the relabelling fields, allowing separate cause-named commits when the browser blocker is resolved.

### Reverse-order test — 2026-10-15

The requested order was run **before any edits or other validation**: 1440, then 900, then 390. Before each invocation `lsof -nP -iTCP -sTCP:LISTEN | grep -i node` returned only the column header, no process. Same Docker wrapper/image, fresh dependency volume, functional project, one worker, zero retries, 30-second scenario timeout and settled-paint preparation. No assertions changed. No baseline captured.

| Order | Width | First navigation (trace) | Scenario duration | Playwright invocation | Result |
|---|---:|---:|---:|---:|---|
| 1 | 1440 | 5.330s | 14.0s | 36.1s | Passed |
| 2 | 900 | 5.256s | 14.1s | 24.6s | Passed |
| 3 | 390 | 11.932s | 18.8s | 29.3s | Passed |

Invocation durations exclude the wrapper's `npm ci`. Logs are `tmp/custody-reverse-{width}.log`; traces are under `tmp/custody-reverse-{width}/`. This is **not** the predicted monotonic reversal: 390 remains slowest, so run order alone is not established as the cause. Nor does three passing runs prove a stable product budget. The earlier classification as a demonstrated custody product defect was premature; the repeatable harness flaw is that first application compilation remains inside the scenario's deadline.

The narrow product path was inspected (`src/app/shell.tsx` uses the 820px media query; Activity/Record screens are eager imports in `src/app/router.tsx`, with no narrow-only dynamic import). Trace comparison:

| Width | Initial HTML duration | HTML wait component | Vite client request | Receipt-heading wait after navigation |
|---|---:|---:|---:|---:|
| 1440 | 0.316s | 0.230s | 1.480s | 0.866s |
| 900 | 0.603s | 0.559s | 2.191s | 0.630s |
| 390 | 3.444s | 3.422s | 4.956s | 0.642s |

All three traces request the same 151 normalized module/style paths; the 390 trace adds no narrow-only module. The requests use the same desktop user agent and `sec-ch-ua-mobile: ?0`; no viewport-width header is sent. Much of the extra delay is already present in the HTML response and shared module requests, before the receipt renders. This does not identify a custody layout fault. Width remains correlated in these observations; its causality is not established while compile/server timing is mixed into the result. No product change or additional browser experiment was made. Reassess the three widths after the approved harness correction rather than claim either a width defect or an order effect from these samples.

### Harness correction proposal — not implemented

`playwright.config.ts` waits for an HTTP response from the Vite development server; `scripts/playwright-setup.ts` only reports the browser version. Neither establishes that application modules have compiled. The tests' first `page.goto` therefore pays development transformation/optimization cost inside the 30-second budget. A settled-paint precondition runs after navigation and cannot remove that cost.

| Option | Cost and limitation |
|---|---|
| Warm-up navigation before scenarios | Smallest harness change; one separately timed, fail-on-error setup navigation per server. Must visit every lazy route using fixtures without contacting live APIs. Root-only warm-up misses `/next` and future lazy modules, so a route inventory must be maintained. No increased scenario deadline. |
| Dependency prebundle | One explicit dependency-optimization step. Application TS/TSX/CSS transforms still occur on demand, so it is insufficient alone. |
| **Production build then preview (recommended)** | One `VITE_CONSOLE_NEXT=true npm run build` in the pinned container before Playwright's scenarios; serve the resulting artifacts with Vite preview on the existing test port. Includes lazy chunks and removes the dev compiler from the request path. No new dependency. Change the browser-server launcher/config and keep explicit build timing/failure reporting and cleanup. Verify fixture interception, feature flag, assets/fonts and same-origin routes. |

Recommended validation cost: typecheck/lint for the launcher/config, the three isolated scenarios, then functional/conformance/a11y and visual comparison against existing baselines after approval. Build time is an explicit extra setup cost per invocation, not yet measured; do not quote an invented estimate. Production CSS/JS can differ from the dev build, so any screenshot difference needs cause analysis and review; no automatic regeneration, assertion changes, retry increases or tolerance changes. This does not purport to measure development cold-start performance; that belongs in a separately named diagnostic. This proposal was approved for work after the custody commits. It is not part of those commits. **No harness change has been implemented.**

### Document authority and consolidation

Renamed `xq-integration-brief.md` to `custody-receipt-evidence-boundary.md`, title “Custody receipt evidence boundary”; updated repository references and the wording test. Its authority is narrowed to custody receipt facts, non-claims and corroboration. The external partner brief remains separately authoritative for the partnership; system statements originate in the repository and partner-directed questions/requests originate externally.

Folding the renamed note into this position loses **nothing** if its short implementation facts are retained: pinned SDK/provider-port boundary; K1/K2 split; required API versus optional dashboard check and safe adapter failures; unverified FetchKey mapping/unsupported corroboration; authority rule and historical ledger. Those facts fit a “Receipt evidence and provider corroboration” section here. Recommend consolidation to one canonical custody position, with the renamed path reduced to a link if old links need preservation. The subsequent approved fold retains those facts below and removes the separate note. This is the sole custody-evidence position. No external document was changed.

### Customer wording and consumer audit

No in-repository consumer derives behaviour from the prose containing `redeemed`. Actual decisions use event `kind` or summary `state`; the XQ test agent parses the redemption output and uses its share. The dependencies on the old sentence were exact Zod literals/defaults and test expectations, all introduced in this uncommitted batch; these were updated together. External consumers cannot be inventoried from this repository, but the new evidenceMeaning field has not been committed or published by this task.

The shared human-readable statement is now:

> Opintel released its share of the key. This does not evidence that the agent obtained the provider's share or decrypted the value.

The legacy `redeemed` mapping is confined to the event/state field and schema documentation. Successful K2 responses and `redeemed` event/summary rows receive the statement. Other event kinds and summary states do not: the earlier sentence explained a named code, whereas the new factual sentence would falsely claim release if defaulted onto a merely granted, expired, revoked or provider-only event. Discriminated schemas and focused tests enforce that distinction. Immutable event codes and the custody mechanism are unchanged. The short console label remains “Opintel share released”, paired with the same non-claim.

### Validation of the wording revision

Typecheck, lint and `git diff --check` passed. Lint log: `tmp/custody-wording-v2-lint.log`. Affected backend suites covered event/summary wording, evidence exports, MCP K2 redemption, custody service, Activity reads and the discovering XQ test agent. The first focused run passed 57/58 in 50.38s; REL-011's exact expected response needed the newly approved evidenceMeaning on its `redeemed` row. Its count, state and origin assertions were preserved. The corrected Activity file passed 8/8 in 13.51s. Thus 58 unique affected tests pass across these focused runs; no full gate result is claimed. Logs: `tmp/custody-wording-v2-focused.log`, `tmp/custody-wording-v2-activity.log`, `tmp/custody-wording-v2-typecheck.log`.

The reverse-order browser runs preceded all wording changes. Their assertions, deadlines and retries were unchanged, and they produced trace artifacts only. No browser rerun or baseline capture followed the wording change; visible console labels are unchanged. No live XQ calls, gate or commit.

## Receipt evidence and provider corroboration — folded authority

This repository position is authoritative for what custody receipt evidence proves, its non-claims and the provider-corroboration boundary. The separately maintained external partner brief is the partner-facing authority for company responsibilities, questions and requests to XQ, prerequisites, demo scope and commercial framing. Statements about these receipt semantics originate here and are carried into the external brief at its next version bump; partner-directed statements originate there and are not duplicated here. This position and the external partner brief are separate documents, not synchronized copies.

5.36 uses pinned jssdk-core 2.0.6 behind the infrastructure provider port. XQ escrows and releases K1 only; Opintel releases K2. The human-readable evidence statement for a successful K2 release is:

> Opintel released its share of the key. This does not evidence that the agent obtained the provider's share or decrypted the value.

Live XQ conformance is blocked by the self-serve credentials’ missing transfer/data entitlement; see xq-escrow-entitlement.md.

CheckApiKey is required. The optional dashboard check uses read-only GetCurrentBusiness with the dashboard access token. Safe authentication/failure results are separate; dashboard failure does not disable custody. Provider response bodies never leave the adapter or reach logs.

### Corroboration boundary

The implementation has no verified mapping from XQ FetchKey events to locator, alias, time and origin. Timestamp units/zone, pagination, duplicates, ordering and event delay are not yet established. The SDK leaves event rows untyped; no field mapping is assumed.

Until verified, XQ `redemptions()` returns `{status: 'unsupported'}`. Settings states “Corroboration: not available for XQ until verified”. First-hand K2 receipt events remain the source of truth. The typed `ProviderRedemption`/`ProviderRedemptions` mapping is the implementation boundary for verified provider events; local corroboration already exercises the receipt path.

## Open question: 390 first-navigation cost

Status: **open, not a gate blocker; no custody product defect established**. In the reverse-order warm observations, 390 first navigation was 11.932s versus 5.330s at 1440 and 5.256s at 900 (roughly 2.3×). The entire scenario was 18.8s versus 14.0/14.1s (roughly 1.34×); the 2.3× figure describes navigation, not total scenario time. 390 remained slower in both orderings. Its HTML response took 3.444s before application rendering. Module and style paths were identical at all three widths. No custody rendering defect was demonstrated.

Specific context check: `e2e/release-custody.spec.ts` varies `page.setViewportSize` only. It uses no mobile device profile, `isMobile`, touch emulation or storage state; every width receives the same fresh Playwright context defaults and `mockActivity` authentication routes. The reverse traces show the same desktop user-agent/mobile header. Recheck this equivalence and any auth redirects after harness adoption before attributing residual cost to narrow layout.

## Custody validation record

The full throwaway browser pass is an explicit **warm-cache measurement precondition**, alongside settled-paint capture readiness, not a gate and not a retry. Warm pass and recorded browser gate use the same pinned container, installed dependencies and live Vite server so warming survives. Existing assertions, timeouts and configured retries are preserved. Logs/results are kept separately. No baseline is regenerated. The recorded gate runs once on the isolated custody candidate, excluding unrelated `/next` work; command results and candidate identity are appended here before commit.

### Isolated candidate: warm pass and independent export validation

The isolated candidate starts at `b1da401` and includes only the two custody commit groups; unrelated uncommitted `/next` work is excluded. The export-only candidate passes 13/13 tests (21.19s test time, 41.00s including setup). Its dedicated omission regression is parameterized over CSV/NDJSON and all three already-recorded revocation reasons: `provider changed`, `credential revoked`, `legacy alias grace ended`. The first commit includes the shared schema reason enum needed to read existing migration-073 events; it does not include the later wording or revocation behaviour.

The **throwaway, non-gate** full browser pass completed in 2178.251s: 375 passed, 5 failed, 0 flaky, 0 skipped; full control conformance visited 54/54 routes with zero findings. Artifacts: `tmp/custody-warm-NOT-GATE.log`, `tmp/custody-candidate/tmp/custody-warm-results.json`. Its failures were:

- `DECL-001/006`: test environment missing inside the container because the isolated checkout's host `.env` symlink was not resolvable there. The recorded browser invocation receives the required service environment explicitly; no secret values are printed.
- `ROW-SCALE inherited pagination and shared picker at 1440`: screenshot height alternated between 5716 and 5819. The overlapping 1440 × 5716 region has **zero differing pixels**; the extra 103 bottom pixels caused the size mismatch. This is a capture-height stability finding, not an established custody rendering defect.
- `5.36 custody Activity rollup and receipt` at 390/900/1440: the approved release wording and non-claim change the summary and its wrapping, shifting the following Requests section. Existing baselines remain untouched.

The first recorded data-gate tier (`test:performance`) exited 1 after 16.53s (Vitest 10.04s): 14 suite failures, one failed test, three explicitly skipped tests, 19 declared tests. The first K-007 query returned `engine_failed`; the shared authenticated-query warm-up then prevented the budgeted cases from running. The isolated checkout lacked `tmp/duckdb-extensions/postgres_scanner.duckdb_extension`, the exact path loaded by `test/fixtures/query/fixture.ts:92`. This is an environment-setup failure, not a measured performance regression. The existing host binary was copied for subsequent tiers, with matching SHA-256 `34c504cf19ec622011cf4c0f4c80946bc3990fab25ee9db5d12f5aaece913c3e`. The failed performance tier is retained and is not rerun.

The recorded `check` invocation passed lint, strict typecheck and **1838/1838 tests in 199/199 files**. Vitest duration: 1211.51s; complete command: 1278.23s. Log: `tmp/custody-gate-check.log`. This is the single normal-suite gate invocation, not a rerun of the focused export test.

The single recorded browser gate completed with **377 passed, 3 failed, 0 flaky, 0 skipped**, in 1603.849s (1616.49s command time). Full control conformance: 54/54 routes, zero findings. No recorded performance deadlines fired. The three failures are `5.36 custody Activity rollup and receipt` at 390, 900 and 1440, each at `custody-activity-present-{width}.png`: the approved summary wording/non-claim wraps and shifts the following Requests section. Inspection of all three diffs shows unchanged chrome, header and filters above the summary. These are explained wording/layout baseline differences, not environmental glyph-edge differences. No baseline was changed. The subsequent receipt screenshot in each failing scenario was not reached and is not claimed as validated.

`DECL-001/006` passed in 15.8s with the environment supplied. `ROW-SCALE inherited pagination and shared picker at 1440` passed on its first attempt in 14.2s; its warm-pass height instability did not recur in this record. Custody functional scenarios passed at 390/900/1440 in 4.0/4.1/3.9s respectively. These total durations show no material width gap on this warmed isolated candidate; they do not supersede the earlier first-navigation observations on the broader working tree. Artifacts: `tmp/custody-gate-browser.log`, `tmp/custody-candidate/tmp/custody-gate-results.json` and its per-scenario diff images.

Collision validation passed 1/1 test in 98.75s (103.51s command time). Shipping-image ephemerality passed 14/14 tests in 2211.28s (2566.99s including build/startup/cleanup); all twelve scenario reports are VERIFIED, with no failures or incomplete coverage. Post-response memory residuals remain explicitly reported, including custody release/expiry/revocation; this result does not assert memory erasure. Logs: `tmp/custody-gate-collision.log`, `tmp/custody-gate-ephemerality.log`; proof artifacts: `tmp/custody-candidate/test-results/ephemerality/2026-10-15T20-43-52.049Z/`.

Overall this gate record is **not green**: the performance tier failed on the missing isolated-checkout scanner prerequisite, and three browser comparisons retain the old custody summary wording. Normal checks, collision and ephemerality passed. No tier was rerun. No product defect was established by these failures; the remaining baseline differences are explained and left unchanged. Harness adoption and any later baseline work are separate from these custody commits.

### Follow-up: isolated production timing and required listener precondition

A timing or baseline run requires **no other listener on the dev ports**, verified immediately before the invocation and recorded in its report, alongside the settled-paint precondition. A run that cannot assert this is **not a measurement**. For these isolated runs the stronger check was used: no host Node listener on any port, and no Node process in the test container before each invocation. Ports 3000, 3100, 3101, 5173 and the test server's 4173 were clear. The test runner then started its own production preview server and cleaned it up after its single scenario. No assertion, scenario timeout, screenshot tolerance or retry count changed. No gate was rerun.

On 2026-10-15, with the user's explicit authorization, the following stack was recorded before SIGTERM. Launchers have no listening port. Commands below are the recorded full commands; nothing was restarted afterward.

| PID | Port(s) | Command |
|---:|---|---|
| 14775 | — (launcher) | `npm run dev:sidecar` |
| 14796 | — (launcher) | `node /Users/rzarita/opintel/node_modules/.bin/tsx sidecar/start.ts` |
| 14797 | 3100 | `/Users/rzarita/.nvm/versions/node/v20.19.3/bin/node --require /Users/rzarita/opintel/node_modules/tsx/dist/preflight.cjs --import file:///Users/rzarita/opintel/node_modules/tsx/dist/loader.mjs sidecar/start.ts` |
| 14709 | — (launcher) | `npm run dev` |
| 14724 | 5173 | `node /Users/rzarita/opintel/node_modules/.bin/vite` |
| 14841 | — (launcher) | `npm run dev:api` |
| 14855 | — (launcher) | `node /Users/rzarita/opintel/node_modules/.bin/tsx --watch src/platform/http/start.ts` |
| 14856 | — (launcher) | `/Users/rzarita/.nvm/versions/node/v20.19.3/bin/node --require /Users/rzarita/opintel/node_modules/tsx/dist/preflight.cjs --import file:///Users/rzarita/opintel/node_modules/tsx/dist/loader.mjs --watch src/platform/http/start.ts` |
| 14857 | 3000, 3101 | `/Users/rzarita/.nvm/versions/node/v20.19.3/bin/node --require /Users/rzarita/opintel/node_modules/tsx/dist/preflight.cjs --import file:///Users/rzarita/opintel/node_modules/tsx/dist/loader.mjs src/platform/http/start.ts` |

Reverse-order isolated runs used the same already-built optimized browser-test bundle, pinned Chromium 153.0.8010.12, desktop contexts and settled-paint preparation. All had zero redirects, zero touch points, no storage-state override and retry index zero. Each scenario is `5.36 custody receipt, revocation and accessibility at <width>` in `e2e/release-custody.spec.ts`.

| Order / width | First navigation to load | HTML responseEnd | Scenario duration | Whole invocation | Result |
|---|---:|---:|---:|---:|---|
| 1 / 1440 | 879.3ms | 70.8ms | 7.795s | 24.45s | Passed |
| 2 / 900 | 334.9ms | 20.2ms | 3.862s | 12.32s | Passed |
| 3 / 390 | 476.9ms | 39.2ms | 3.707s | 13.79s | Passed |

First-navigation timing is the browser PerformanceNavigationTiming duration through load; scenario duration is Playwright's test result, and whole invocation includes server/runner startup and teardown. Listener checks were saved immediately before invocation at 21:04:32, 21:06:28 and 21:07:49 EDT respectively. All three recorded empty Node-listener lists. Final verification also found no Node listeners; the user's stack remains stopped.

The earlier ~2.3× narrow-width penalty and 3.444s HTML response do not persist: 390 is 0.96× the 900 scenario duration and is the fastest scenario, while the first run (1440) is slowest. This supports a development compilation/serving or run-order cost rather than an established narrow custody rendering defect. The first-navigation durations are not strictly monotonic (390 exceeds 900), so this does not prove run order is the only remaining timing variable. No application fix or deadline relaxation is justified by these results. Earlier full-production observations made with the user's stack active are not isolated measurements under this rule.

Artifacts: `tmp/custody-dev-stack-stopped.json`; `tmp/production-isolated-{1440,900,390}-precondition.json`; `tmp/production-isolated-{1440,900,390}.log`; `tmp/production-isolated-summary.json`; per-run JSON and navigation attachments under `tmp/custody-candidate/tmp/production-isolated-<width>.json`. These are follow-up harness measurements, not another gate record.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1.0 | 2026-10-15 | Record revocation and evidence-wording positions; add escrow refusal coverage. | No mechanism change in the recorded proposals; tests assert fail-closed refusal. |
| 1.1 | 2026-10-15 | Implement approved local-first revocation, durable cleanup and export projection correction. | Revocation now takes local effect during a provider outage; exports include previously omitted release events. These are behaviour changes distinct from the wording change. |
| 1.2 | 2026-10-15 | Audit exact shared wording, export regression scope and isolated viewport validation. | No behaviour changed in the custody mechanism by the wording change; wording now matches what the system proves. Corroborated redemption still requires XQ's fetch event. |
| 1.3 | 2026-10-15 | Record reverse-order evidence and unimplemented harness options; rename the evidence note and remove legacy code from customer prose. | No behaviour changed in the custody mechanism; wording now matches what the system proves, and the release fact is attached only to events that prove it. Corroborated redemption still requires XQ's fetch event. |
| Receipt note 1.0 | 2026-10-12 | Initial repository brief in 97a42b8. | Records the XQ split-key integration and unverified fetch-event contract. |
| Receipt note 1.1 | 2026-10-15 | Use “Opintel share released” and the exact shared non-claim. | No behaviour changed in the custody mechanism by this wording change; wording now matches what the system proves. Corroborated redemption still requires XQ's fetch event. |
| Receipt note 1.2 | 2026-10-15 | Record repository/system and external/partner authority; describe the unverified event mapping as an implementation boundary. | No behaviour changed in the custody mechanism; wording now matches what the system proves. Corroborated redemption still requires XQ's fetch event. |
| Receipt note 1.3 | 2026-10-15 | Rename to custody-receipt-evidence-boundary.md, narrow authority and remove the legacy code from customer prose. | No behaviour changed in the custody mechanism; wording now matches what the system proves. Corroborated redemption still requires XQ's fetch event. |
| 1.4 | 2026-10-15 | Fold the evidence note, record the open 390 question and approved warm-pass gate precondition. | No custody-mechanism behaviour changed by the wording/fold; wording matches what the system proves. Corroborated redemption still requires XQ's fetch event. Harness adoption remains separate. |
| 1.5 | 2026-10-15 | Record authorized shutdown, reverse-order isolated production timings and mandatory immediately recorded listener precondition. | No custody mechanism changed. Wording matches what the system proves; corroborated redemption still requires XQ’s fetch event. No gate rerun or baseline change. |
