# Opintel — Master Backlog

**This document drives implementation.** It is the single source of truth for what is built,
what is not, and what is next. No work starts that is not a row here.

Last full audit: 17 October 2026 · Owner: Rick Zapata

---

## How this document is used

**Every implementation session starts here.** Read the Now section, take the highest row that
is not blocked, and do that. If the work you are about to do is not a row in this document,
stop and add it first.

**Every session ends here.** Update the rows you touched. A status change requires evidence:
a `file:line` that demonstrates it, or the commit that closed it, plus the date the evidence
was checked. A status asserted without evidence is not a status.

**Three rules that keep this document honest.**

1. *Evidence beats memory.* Rows are verified against the code, never against what a previous
   document claimed. Plans, positions and deferral logs are inputs; they are not status.
2. *Nothing is deleted.* Closed rows move to Done with their commit. Dropped rows move to Out
   of scope with the reason. A row that disappears silently is a row that comes back as a
   surprise. Identifiers are permanent references; reordering never reassigns them.
3. *Coverage is stated.* The Coverage section records which parts of the product have been
   audited against this document and when. What has not been audited is named, not assumed
   complete.

---

## Customer frame

There is no named customer yet. Everything below is ordered for **the shortest credible path
to a product that can be demonstrated and sold**, and anything no real customer has asked for
waits until one does.

Two consequences, both deliberate:

- **Per-agent row scoping is not on the critical path.** Literal filters per pool work today
  and are enough for a demonstration and a first deal. Twelve pools serve twelve cedants. The
  design (C1–C5) stays recorded and is promoted the day a customer requires it.
- **The console is on the critical path.** A product that cannot be shown cannot be sold, and
  the console is the entire demonstration surface.

---

## Ordering rule

Rows are ordered by what a customer loses without them, in this sequence:

1. **Open doors.** Anything a buyer's security review would find. These precede features.
2. **What they touch daily that does not work.** The console, and the relationships it manages.
3. **Capabilities they are paying for that do not exist yet,** and the evidence that proves
   those capabilities ran.
4. **Correctness debt that bites in production.**
5. **Deployment,** once there is a date.
6. **Deferred,** until a customer asks.

Size is not a factor in ordering. A Large row that a customer needs precedes a Small row that
nobody has asked for.

---

## Decisions outstanding

These gate implementation and only Rick can make them. A decision blocking a row is listed on
that row.

| # | Decision | Gates | Note |
|---|---|---|---|
| D-01 | Who may create a company — a designated bootstrap operator, invitation only, or platform admin only? | Z-03 | Blocks the first security row. |
| D-02 | Custody trust boundary: the Application transiently holds both shares before escrow. Accept and record it as a disposal property, or move the provider port into the Engine. | B5 | Rick's stated position is that disposal, not ignorance, is the guarantee. Recording that closes a Large row. |
| D-03 | Is per-agent row scoping a buying requirement? | C1–C5, C3 | Currently answered "not yet". Revisit when a customer asks. |
| D-04 | Jurisdiction in industry packs: a pack dimension or separate packs; project or filing party. | B4 | Deferred is an acceptable answer; say so explicitly. |
| D-05 | Pool exemption workflow — in Slice 1 or not. | B2 | Currently deferred by design. |

**D-05 consequence (c):** Alert delivery uses the customer's own channels, their internal relay
for email, so no new egress is introduced by Opintel. Alert bodies carry counts and
identifiers only, never personal data, with detail behind the console.

---

## Now

### S5-stage-4 · Independent provision, seed and soak tools
**Status** Next · Stage 3 prerequisite delivered at `f905ce7`; checked 24 October 2026.
**What** Deliver independently runnable provisioning tools against deployed endpoints,
opt-in synthetic seeding with explicit target/version/seed and ANALYZE, and external
soak preflight for observer access, fixture/source readiness and lifecycle coverage.
No demo data or identities are copied with deployment images or installed implicitly.
**Verification** DEP-009–011, completed-candidate gate and stage commit, following the
[five-stage plan](implementation-plan.md#s5-follow-up--independent-gateway-and-engine-deployment-2026-10-23).
Stage 5 (actual split-host installation and the 30-minute soak, DEP-012–013) follows
stage 4; it is not included in the delivered stage-3 result.

### X-01 · Engine segfaults under sustained concurrency
**Customer** The Engine is the data plane. On 18 October it crashed with EXC_BAD_ACCESS in
duckdb::DBConfigOptions::operator= inside DatabaseInstance::Configure while opening a DuckDB
instance, after 878 queries and roughly eighteen minutes of ten concurrent agents. In a
customer deployment this is a total outage of governed data access. It is the most serious
defect found to date and nothing else in this document matters if it recurs.
**What** Investigate the remaining configuration-copy race hypothesis during concurrent
instance open with extension loading. Construction alone is cleared by the bounded probes
below; the original mixed workload still needs reproduction before claiming a root-cause
fix. Each query opens a privileged/agent pair for preflight and another pair for execution
(four constructions in total); standalone validation opens one instance.
**Evidence** /Users/rzarita/Library/Logs/DiagnosticReports/node-2026-10-18-140612.ips, PID
72511, 18:06:04 UTC; tmp/soak/2026-10-18T17-47-21.269Z-72578.jsonl
**Status** Open · Narrowed; not reproducible in the bounded probes on DuckDB 1.5.6
(binding 1.5.6-r.1)
**Note** Fail-closed held throughout: 5,685 queries after the crash were refused and none
returned data.
**Investigation, 21 October 2026**
- Construction cleared within the tested profile: parallel 2/4/8 each completed and closed
  10,000 instances, exit 0. Peak RSS was 70.04/75.50/85.24 MiB respectively.
- Concurrent open plus signed PostgreSQL scanner LOAD and `duckdb_functions()` also did
  not reproduce the crash on 1.5.6: parallel 4/8 each completed and closed 5,000 instances,
  exit 0, with peak RSS 269.93/358.32 MiB.
- JS vector fixes 447/495 are included in 1.5.6-r.1 and absent from the earlier 1.4.3-r.3,
  but are not our inspected path: staging transfers DuckDB-owned chunks through an
  appender or binds scalar INSERT values; it does not use the affected JS list-vector
  writer or low-level validity-mask accessors.
- The capture narrows the suspected cause to configuration copying during concurrent
  open with extension load: the fault is in `DBConfigOptions::operator=` at construction,
  with scanner and catalogue work in other threads. A configuration-copy race is the
  working hypothesis, not a proven mechanism or demonstrated upstream fix. The capture
  cannot identify the exact query/validation caller and contains no RSS/system-pressure
  sample establishing memory exhaustion.

Full measurements, settings, source paths, version ancestry and limits are retained in
[x01-construction-and-binding.md](review/x01-construction-and-binding.md) and
[x01-scanner-load-concurrency.md](review/x01-scanner-load-concurrency.md). These bounded
results clear the tested construction paths, not the original sustained mixed workload;
X-01 remains open. Documentation only; no product or runtime-setting change.

### X-02 · Nothing supervises the Engine
**Customer** The Engine stayed dead for 38 minutes. No restart, no alert, no notice. A
customer would discover it from their agents, not from us. This is the Engine half of A3 and
should not wait for it.
**What** Supervision that restarts the Engine, and something that says it happened.
**Status** Open · Medium

### X-03 · An Engine outage cannot be diagnosed from its refusals
**Customer** Of 5,685 refusals, 3 named the real cause and 5,682 were unclassified, because
the response mapper does not recognise engine_registry. An administrator facing this outage
would have no idea what was wrong.
**Evidence** src/modules/mcp/application/response.ts:109,
src/modules/engines/application/registry.ts:33
**Status** Open · Small
**Note** Same class as E-07. Consider fixing them together.

### X-05 · Console unusable while agents are running
**Customer** With ten agents running, the operator cannot see the system they are meant to be
governing. Screens load, wait, then show "The service could not be reached".
**Cause, now measured** Database pool exhaustion. In the 18 Oct 21:12 to 21:32 capture, 632 of
1,196 one-second samples had idle 0 with callers queued, peaking at 33 waiters on a pool of 10.
Event loop delay averaged 22 ms with one sample above 100 ms in the whole run, so the process
was not CPU bound. /runs/summary reached p95 20.6s, max 21.0s. Four requests ended status 0,
the client hanging up. src/platform/db/scope.ts:6, scope.ts:31
**Fix** Reserved connection capacity for console reads, bounded admission and a bounded
acquisition wait on the agent side, plus an application timeout in the client so a failure is
fast and says what it was. tmp/diag/2026-10-18T21-12-51.565Z.jsonl
**Status** Open · Medium

### G-07 · Evidence left open when the Engine dies mid-query
**Customer** Eighteen requests in the 18 Oct fault run, three of them custody queries, were
classified correctly to the agent but left their evidence open with no completed outcome. The
product asserts a receipt on every answer; these are holes in the record, and an abandoned
request is indistinguishable from one still in flight. query.ts:51 deliberately declines to
write a refusal without source-usage proof, which is right: we cannot claim nothing was
disclosed when we cannot prove it. But we can record what is true, that the Engine serving
this request terminated at a known time and the outcome is unproven, which closes the record
without asserting an outcome we did not observe. Keep that state distinct from a proven
refusal in both the receipt and the console.
**Evidence** tmp/soak/2026-10-18T22-18-38.220Z-81762.jsonl; src/modules/mcp/application/query.ts:51
**Status** Open · Governance · Ahead of X-06

### Z-03 · Restrict company creation
**Customer** Any authenticated account can create a company and becomes its administrator.
For a product whose proposition is governed access, this is the defect class we least survive
having found for us.
**Status** Open · Medium · **blocked on D-01**
**Evidence** `src/modules/tenancy/api/company-routes.ts:11`,
`src/modules/tenancy/infrastructure/company-repository.ts:44`, checked 17 Oct 2026

### F5a · Authentication guard coverage
**Customer** Development routes bypass `AuthGuard`, and conformance does not assert that an
anonymous caller is refused. The guarantee is untested where it matters most.
**Status** Open · Medium
**Evidence** `src/app/router.tsx:37`, checked 17 Oct 2026

### E5 · Platform-admin audit and boundary proof
**Customer** Platform-administrator access crosses tenancy and is not audited. A reviewer will
ask who can reach customer data and what record exists of their having done so.
**Status** Open · Medium
**Detail** `withPlatformAdmin` still carries its audit TODO. Path validation is tested; the
import and call-graph proof is not.
**Evidence** `src/platform/db/scope.ts:73`, `test/http-server.test.ts:234`, checked 17 Oct 2026

### Z-04 · Adopt this document
**Customer** Two backlogs were assembled in two days, each missing items the other had. This
document replaces `docs/review/slice1-remaining.md` as the status register; that file becomes
a pointer here.
**Status** Open · Small
**Detail** Mark the nine rows below as Done, the three cancelled rows as cancelled rather than
deferred, and remove the AddContact proposal as superseded rather than complete.

---

## Next — make it demonstrable

### K-01 · `/next` console: finish Pools
**Customer** The console is the demonstration. Pools is the screen that shows the product's
central idea — credentials, bindings, treatments and row filters in one place.
**Status** In flight · Large
**Detail** The prototype lives only on `wip/2026-10-15-console-custody-harness` (e62ea7f).
Preservation is established; acceptance is not.
**Evidence** branch e62ea7f, checked 17 Oct 2026

### K-02 · `/next` console: Home, Sources, Activity, Settings, Decisions
**Customer** Five of six screens are unscoped. A demonstration that opens one finished screen
and five prototypes is not a demonstration.
**Status** Open · Large · depends on K-01

### A6 · Pool and source binding route and controls
**Customer** Binding a data source to a pool is the relationship the whole model rests on, and
it cannot be managed through the API — the service and persistence exist, but no route is
mounted.
**Status** Open · Medium
**Evidence** `src/modules/pools/application/binding.ts:15`,
`src/modules/pools/infrastructure/binding.ts:16`, checked 17 Oct 2026

### A9 · Authenticated account presentation
**Customer** The account footer says "Your account" and shows a placeholder initial. It is the
first thing a prospect notices and the cheapest thing to fix.
**Status** Open · Small
**Evidence** `src/app/shell.tsx:47,:59`, checked 17 Oct 2026

### A4 · Invitation management
**Customer** An administrator cannot see pending or expired invitations, resend one, or review
what was revoked — revocation deletes the record rather than retaining its history.
**Status** Open · Medium
**Evidence** `src/modules/tenancy/infrastructure/invitation-repository.ts:11,:65`, checked
17 Oct 2026

### E2 · Introspection ordering and cursor
**Customer** Source introspection pages by `id < cursor ORDER BY id DESC` over non-monotonic
UUIDs, so results are mis-ordered and a cursor can skip rows. Visible to anyone browsing a
large source.
**Status** Open · Small
**Evidence** `src/modules/sources/infrastructure/introspection-query.ts:29`, checked
17 Oct 2026

---

## Next — make custody true and visible

### G-06 · Verify a credential's recipient identifier at registration
**Customer** The recipient identifier decides where every custody release for a credential
is escrowed. Today it is supplied at registration and stored as given, so an identifier that
is wrong, mistyped or claimed by the wrong party sends that credential's releases to someone
else, permanently, and nothing downstream notices. This is the most consequential unverified
input in the system.
**What** Opintel escrows a nonce addressed to the claimed identifier and requires the caller
to return it before the association is stored. Only the holder of that certificate can fetch
it, so the claim is proven rather than trusted. The identifier itself is discoverable: it is
the `sub` claim of the token the exchange returns, so the agent knows it first-hand and does
not read it from a dashboard.
**Note** This is the same challenge mechanism as C3, applied at registration rather than at
query time. C3 as written covers only the row-scoping use. The partner brief's Figure 4 shows
only that use as well, and should gain this one when the brief is next revised.
**Status** Open · Medium · after V-01 and V-02 soak testing

### G-01 · Sender authentication and renewal
**Customer** Opintel's escrow identity is a hand-made token from a PIN flow with no renewal
path and roughly a sixty-day life. An unattended deployment stops escrowing when it expires,
and the fix requires a person reading a mailbox.
**Status** Open · Medium
**Detail** Certificate authentication may be the answer here too — the device token is a full
access token that can store packets — which would remove the last human step. Confirm against
the vendor docs before designing.
**Evidence** `src/modules/release-custody/infrastructure/availability.ts:8`, checked
17 Oct 2026

### H-01 · Discover XQ event types
**Customer** Corroborating a release from XQ's side is part of what the receipt claims. We do
not know which event a key fetch produces.
**Status** Open · Small
**Detail** `GET /eventtypes` against our own account. Needs nothing from XQ.
**Evidence** `docs/vendor/xq-docs/c543b524ef0bd-list-event-types.md`

### H-02 · Capture a hook callback from a real fetch
**Customer** Same as above: establishes the payload and whether packet metadata is echoed.
**Status** Open · Small · depends on H-01
**Detail** `POST /hook` against a reachable receiver, then the proven device-fetch path.

### H-03 · Fetch event-log correlation
**Customer** Establishes which `action` value a fetch produces and which field identifies the
packet — the join between XQ's event and our receipt.
**Status** Open · Small · depends on H-01
**Detail** `key` in an event row is the API-key id, not the locator, so the join is not the
obvious one.
**Evidence** `docs/vendor/xq-docs/3dddf815a642f-event-summary.md`

### H-04 · Batch packet sub-day expiry
**Customer** A release grant should live minutes, not hours. The batch endpoint takes
`expires` plus a `unit` whose accepted values are not documented; if it takes minutes, we
already have what we need.
**Status** Open · Small
**Evidence** `docs/vendor/xq-docs/8e03fb4bd5ea0-create-and-save-multiple-key-packets-with-individual-metadata.md`

### D2 · Provider corroboration
**Customer** The receipt currently records only that Opintel released its share. Corroboration
from XQ is what makes the release evidence two-sided.
**Status** Open · Medium · depends on H-01, H-03
**Evidence** `src/modules/release-custody/infrastructure/xq-provider.ts:25`, checked
17 Oct 2026

### G-02 · Certificate fact in receipts and evidence
**Customer** The receipt should record the identity a release was addressed to. It must not
present an association as proof that the caller authenticated by certificate to Opintel — it
did not; it authenticated with a pool key.
**Status** Open · Medium
**Evidence** `src/shared/release-contract.ts:6`, checked 17 Oct 2026

### G-03 · Certificate status and expiry in the console
**Customer** When an agent's certificate lapses its fetches fail and the customer sees "the
agent stopped working". The Agents and Pools views should show the association and its expiry.
**Status** Open · Medium
**Detail** Expiry needs a data source; the association schema has no expiry field.
**Evidence** `src/app/pools/screens.tsx:36`,
`migrations/079_credential_certificate_association.up.sql:5`, checked 17 Oct 2026

### D1 · Live XQ conformance, end to end
**Customer** What has been proven is a probe: escrow by the owner sender and fetch by a
certificate device, share byte-exact. What has not been proven is the production path —
MCP query through escrow, K2 redemption, agent decryption — nor device non-recipient refusal.
**Status** Open · Medium
**Detail** The earlier `transfer/data` blocker is obsolete; do not continue describing escrow
as entitlement-blocked.
**Evidence** `docs/review/xq-database-storage-probe-2026-10-16.md:525,:812`

### G-04 · Certificate revocation and expiry lifecycle
**Customer** Revoking a credential must actually stop the agent. Local revocation stops
Opintel from using it; what XQ does to an already-issued device token is undocumented.
**Status** Open · Large · partly blocked on XQ
**Evidence** vendor docs silent, checked 17 Oct 2026

---

## Later — correctness debt

### G-10 · HAVING acts as an outcome oracle
**Customer** For a filtered singleton group, a HAVING clause that removes the group returns
zero rows and passes validation, while a predicate that retains it is refused. The difference
between those two outcomes discloses information about the protected value.
**Evidence** sidecar/sql/application/treatments.ts:105, sidecar/sql/application/execute.ts:98
**Status** Open · Medium

### G-11 · Decision needed: differencing across queries
**Decision** Reconstruction by differencing is unprevented and undetectable after the fact,
documented in docs/algorithm-specifications.md:288 and expected by regression J-055. Receipts
retain neither predicates nor group sizes, so an auditor cannot reconstruct what a sequence
revealed. Decide whether Opintel claims only scope reduction, which is the current honest
position, or invests in bounded differencing control with contributor tracking across a
stable snapshot.
**Status** Open · Decision, not work

### E-06 · Custody preparation discards its cause
**Customer** When release preparation fails, the operator is told to check the custody
provider and nothing else. The underlying exception is caught and thrown away, so six
failures in a soak run cannot be attributed to XQ, the network, the database or anything
else. In production this is an incident with no evidence.
**What** Record the cause: in the evidence record, in the server log, or both. The agent's
message can stay as it is.
**Evidence** src/modules/release-custody/infrastructure/query-release.ts:37; fourth appearance in the X-05 thirty-minute run: receipt `01a157d5-e001-7be3-83d7-ff4194f3f988`, generic `release_prepare_failed` without missing-association reason. Underlying exception was discarded.
**Status** Resolved · Allowlisted diagnostic classes/codes/status retained in refusal-stage evidence and authorized detail/export; no native text or parsed stack values. Unknown classes/codes become null. Exact agent refusal and fail-closed behavior unchanged. The original gate passed 1,947 tests/217 files, 59 conformance checks and browser/MCP smoke; the tightening has its own validation record in `docs/review/e06-custody-refusal-cause.md`.

### E-07 · Refusal taxonomy conflates governance with infrastructure
**Customer** A credential with no certificate association and an unconfigured source scanner
both surface as dependency_unavailable. One means the agent is correctly not entitled; the
other means the deployment is broken. An administrator reading Activity cannot tell them
apart, and will chase the wrong thing.
**What** Separate the codes so a governance refusal reads as a decision and an infrastructure
failure reads as a fault.
**Evidence** 686 and 155 occurrences respectively in the 18 Oct soak run
**Status** Open · Small

### E-08 · Fresh dev environments have no PostgreSQL scanner configured
**Customer** Not customer-facing, but it costs a day per person. `dev:up` writes a sidecar
configuration with no `postgresExtension`, so every clear-column read fails with "A signed
PostgreSQL scanner matching DuckDB v1.4.3 is required". It produced 686 of the 847 refusals
in the 18 Oct soak run before anyone noticed, and every fresh checkout reproduces it.
**What** `dev:up` configures it, or fails loudly at startup saying what is missing. Deployed
configurations need the same setting; production bakes the scanner into its image but the
setting must still be present.
**Evidence** tmp/sidecar/service.json, configured by hand on 18 Oct 2026;
sidecar/session/infrastructure/duckdb.ts:62
**Status** Open · Small

### E-11 · An empty evidence export is indistinguishable from an excluded one
**Customer** When the cutoff excluded every row, the export succeeded with empty NDJSON and a
header-only CSV. An auditor cannot tell that from a genuine zero-record export. The export
should state the window it covered and the number of records it found, so an empty result is
an assertion rather than an absence.
**Evidence** src/modules/evidence/infrastructure/export.ts:35; the 18 Oct gate failures
**Status** Open · Small

### E-09 · Name receipt scan counts returnedRows
**Customer** The receipt's former `entitledRows` field reported the count after the agent's own filter
is combined with the governance predicate, so a query for one record in a pool entitled to
five records reports 1. An auditor reading the receipt takes that as the entitlement. The
partner brief was reported to describe receipts as carrying entitled-row counts, which is the same reading. The external brief is outside this repository change by reader instruction.
Either the field means what its name says, or its name has to change, and the brief with it.
**Evidence** 110 alarms in the 18 Oct 16:07 soak run, every one this mismatch;
scripts/soak/reinsurance.ts:154, sidecar/execution/application/execute.ts:89
**Decision** Rename to `returnedRows`, measurement unchanged; compare the soak against the query's own expected count. Immutable decision identifiers continue to identify entitlement scope. All 165 alarms in the X-05 thirty-minute run are this pattern (75 × 5/1, 90 × 7/1), zero other row-count findings.
**Status** Resolved · `returnedRows`, measurement unchanged; authorized fresh full gate passed (1,943 tests, 59 conformance checks, browser/MCP smoke). See `docs/review/e09-returned-row-receipts.md` for the failed initial gate, additional oracle correction, full file list and final validation.

| # | Row | Why it matters | Size |
|---|---|---|---|
| A5 | Idempotency key on source deletion | Replay of a delete is unprotected where every other pool operation is | Small |
| A7 | Remove `filing_party` compatibility shims | Must go before any deployment carries them forward | Small |
| E1 | `catalog_element.ordinal` NOT NULL | Nulls permitted indefinitely; historical rows need disposition first | Medium |
| E4 | Extraction NOT NULL migration | Needs deployment evidence that backfill completed | Medium |
| F5b | Product webfonts in the test image | Visual tiers render in fallback fonts | Small |
| Z-05 | Traceability matrix and generator | Required by the definition of done, never built, no gate tier. Two backlogs in two days were each incomplete; this is what closes that permanently, and it generates the Coverage section below. | Large |

---

## Later — deployment, when there is a date

| # | Row | Size |
|---|---|---|
| A2 | First-account bootstrap: operator CLI, one company and admin, durable claim, audit | Medium |
| A3 | Production API supervision: dedicated container, readiness separate from liveness, partition-horizon alerting | Medium |
| A1 | Two-phase SSO provider rotation under enforcement | Medium |

---

## Not scheduled

### H-06 · Test-tree wall-clock audit
**Customer** Date-sensitive fixtures can fail depending on when validation runs.
RED-019 is corrected with a fixed injected clock and identical 00:10/23:50 UTC
host-clock cases; other fixtures require separate review.
**What** Review the remaining wall-clock fixture inputs without weakening real
expiry/deadline checks or the intentional nondeterministic canonicalizer.
**List** `activity.test.ts`, `aggregate-contributor.test.ts`, `canonicaliser-assignment.test.ts`, `catalog-tree.test.ts`, `certificate-association.test.ts`, `company-routes.test.ts`, `dashboard-requests.test.tsx`, `dashboard.test.ts`, `engine-registry.test.ts`, `entitlement-read.test.ts`, `entitlements.test.ts`, `evidence-export.test.ts`, `evidence-writer-migration.test.ts`, `evidence.test.ts`, `filing-register.test.ts`, `fixtures/bulk-entitlements/fixture.ts`, `fixtures/evidence-export/fixture.ts`, `industry-migration.test.ts`, `industry-routes.test.ts`, `introspection-job.test.ts`, `introspection-routes.test.ts`, `isolated-tokenization.test.ts`, `key-custody.test.ts`, `observation-groups.test.ts`, `performance/activity.test.ts`, `performance/catalog-tree.test.ts`, `performance/evidence-export.test.ts`, `policy-version.test.ts`, `pools-ui.test.tsx`, `project-routes.test.ts`, `project-update-routes.test.ts`, `relationship-suggestions.test.ts`, `release-custody-availability.test.ts`, `source-registration.test.ts`, `sse-lifecycle.test.ts`, `sse.test.ts`, `temporal-declarations.test.ts`, `tenancy-list-routes.test.ts`, `token-declarations.test.ts`, `type-observation-routes.test.ts`. All paths are under `test/`; the
[full audit](review/red019-test-clock-audit.md) lists line numbers and separately
identifies four timing/bounds files and the deliberate negative control.
**Status** Open · Not scheduled · Audit only; no other fixture fixes authorized.

### X-08 · Rollup coverage for the seven-day summary
**Customer** Closed days are recomputed on each Dashboard refresh: the measured
seven-day counts read sends **29,374 raw rows into 14 output groups**, rather than
serving those days from aggregate rollups. JIT tuning removes compilation cost,
but the remaining work still scales with request history.
**What** Assess and implement aggregate rollup coverage for closed days in the
seven-day summary, preserving authorized filter/grouping semantics, historical
delivery facts, custody receipt counting and the current day's live read. Existing
per-run retention rollups are not a precomputed daily summary.
**Evidence** `src/modules/evidence/infrastructure/read.ts:50`,
[raw-row plan and endpoint measurement](review/x07-summary-statement-settings.md),
checked 20 October 2026.
**Status** Open · Not scheduled · No implementation authorized by this row.

### F-01 · Threshold alerts
**Customer** Clients set thresholds on the conditions that matter to them and are notified out
of band when one is crossed. This is the channel responsible for timely detection, so
thresholds are evaluated server side rather than in a browser that may be closed. A sent
alert carries evidentiary weight, SMS notably so, which makes the record of what was
evaluated, what fired, what was sent and whether delivery was confirmed part of the evidence
set, retained on the same terms as receipts. Alert bodies carry counts and identifiers only.
**Status** Open · Not scheduled · Blocked by X-05 and X-06

---

## Deferred until a customer asks

| # | Row | Why deferred |
|---|---|---|
| C1 | Scope grants: Postgres rows, transactional SpiceDB mirror, reconciliation | D-03 — not a buying requirement yet |
| C2 | Step 3a resolution; lift `row-decisions.ts:58` and `execute.ts:31` | depends on C1 |
| C3 | Possession challenge and default-off require-bound switch | depends on C1; mechanism now proven feasible |
| C4 | Scope-grant revocation | depends on C1 |
| C5 | Resolved-scope receipts and Activity evidence | depends on C1 |
| B2 | Pool exemption workflow | D-05 |
| B4 | Jurisdiction packs | D-04 |
| O1 | Discovery scheduling and daily row budgets | 5.16a |
| O2 | Notifications, digests, administrator two-step | deferred contracts |
| O3 | Multi-engine key distribution | 5.21 |
| O4 | Structured operation metadata | 5.32a |
| O5 | Prompt ask and clarification tools | Slice 1b |
| O6 | Touch disclosure for truncated names | deferred |
| — | 5.37 row tag-rule execution and agent-view simulation | later by plan |
| — | 5.38–5.39 derived scopes and issuer admission | later by plan |
| — | Domain and integration suite cost | measured optimisation, not blocking |
| — | 5.25a source-value overlap · 5.26 canonical identity · streaming S2e · statement-specific pruning · treatment-history reader · exposed-schema control · multi-tenant enrolment | recorded in `docs/review/deferred.md` |

---

## Done

### S5-stage-3 · Independent gateway and engine deployment
**Status** Delivered · `f905ce7`, merged into main and pushed; checked 24 October 2026.
**What shipped** Separate gateway/engine packages, explicit migration and authorization
schema jobs, the constrained 24-hour first-owner claim, gateway-independent engine
startup/replacement, derived heartbeat egress and automatic source retest. All six AMD64
images were built from the clean committed revision, audited, published to GHCR by
digest and accepted using those published digests, including offline ingest delivery.
**Evidence** Green gate: 2,043 normal tests, 59 conformance tests and browser/MCP smoke;
[gate record](review/stage3-gate-authorised-repairs.json). Documentation follow-up
`b5d5423` is on main: [release manifest](review/stage3-release-linux-amd64.json),
[final acceptance](review/stage3-release-acceptance.json), and
[per-deliverable report and reproduction commands](review/stage3-progress.md).
**Coverage** AMD64 on this host. ARM64 is built natively from the same committed
revision; no ARM64 build or actual split-host proof is claimed here. Stage 4 is next.

### X-06 · Console fetches every run individually
**Customer** A single open browser tab generated about 4,500 API requests in twenty minutes,
roughly 3.8 per second, including about 440 calls to /api/v1/runs/<id> with each id fetched
exactly once. The console is a large part of what exhausts the pool it then cannot get a
connection from. Batch or embed the run detail the feed already lists.
**Evidence** Same capture; src/app/dashboard/read-model.ts:21
**Status** Closed · X-06 passed the authorized full gate. Measured 113 requests
in five minutes (0.3767/s versus 3.8/s historically), zero per-run detail calls.
Credential/key and agent status retain a 30-second cadence; configuration has a
five-minute fallback with its older as-of displayed. See
[the review and measurement](review/x06-console-request-volume.md).
**Second part · 20 October 2026** Merged: authenticated observations and credential
last-use writes are unchanged; presence publishes only on observable transitions.
Opt-in SSE diagnostics count connections, snapshots and closes by reason,
including event/keepalive backpressure. Presence notifications fell from 2,348 to
40 in the paired ten-minute runs; no reconnect/snapshot feedback loop was observed.
Invalidation breadth was not narrowed. The Dashboard-only harness does not
attribute the 2,759 historical pool-list reads; that number remains unexplained.
**Evidence** `src/modules/pools/infrastructure/presence.ts`,
`src/platform/http/server.ts`, [second-part measurement](review/x06-presence-stream-lifecycle.md),
checked 20 October 2026; final landing validation is recorded with X-07.

### X-07 · A query held a pooled connection for 19 seconds
**Customer** Against a p95 hold time of 219 ms, one acquisition held its connection for 19.2
seconds, which is a tenth of the pool for that whole period. Identify the query. It may be the
same work behind /runs/summary at p95 20.6s.
**Evidence** Same capture, db records, scope opintel_app
**Status** Closed · 20 October 2026 · Reader acceptance of the loaded endpoint measurement.
**Resolution** Counts and custody disable JIT only for their statements; counts
uses measured work_mem of 5,879 KiB, with no post-load sort spill. A bounded
jit/work_mem allowlist preserves arbitrary-setting rejection and tenant scope.
Ten agents, Dashboard open, ten minutes: **summary p95/max 4.37 s**;
**console p95 3.39 s / max 4.37 s**, from **18.69 s / 22.38 s**.
The load passed its exercised assertions with no disconnects. This closes the
measured summary latency problem; the old capture lacks the SQL/request identity
needed to prove that its exact 19.2-second acquisition was this statement.
**Evidence** `src/modules/evidence/infrastructure/read.ts:50`,
`src/platform/db/scope.ts:13`, [measurement and landing validation](review/x07-summary-statement-settings.md),
checked 20 October 2026.


### G-08 · MIN and MAX return a real individual value from an aggregate-only column
**Customer** MIN and MAX are permitted aggregates, and their result is an actual contributing
value, so a single query returns one individual's data from a column the pool was never
entitled to read. The group-size floor does not help: five rows contribute and one of them is
returned verbatim. Unlike differencing this needs no intent, no sequence and no skill.
**Decision** Remove MIN and MAX for aggregate-only columns. This deliberately loses extrema
analysis; there is no bucketing or second-threshold alternative. Preserve a specific governance
refusal naming the operation and column.
**Evidence** sidecar/sql/application/treatments.ts:128; test/sql-treatments.test.ts:38; test/mcp-query.test.ts:73
**Status** Done · Governance · 19 October 2026

### G-09 · The group-size floor counts rows, not contributors
**Customer** The floor uses COUNT(*), so join duplication inflates it without adding
independent contributors, and a group of five rows can be one person counted five times.
Count distinct non-null contributors instead.
**Evidence** sidecar/sql/application/cardinality.ts:12; src/modules/entitlements/application/compile.ts:171; test/aggregate-contributor.test.ts:17; test/staging-source.test.ts:91
**Status** Done · 19 October 2026
**Decision · 19 October 2026** The source author declares the contributor entity key, which may identify a policy, cedant or claimant rather than a person. Reject aggregate-only authoring/compilation if it is missing, naming the column. Carry it through joins and count distinct non-null contributors in each final group, not on the base table. No inferred primary key and no distinct-value substitute.
**Rejected** `COUNT(DISTINCT protected_value)` still lets one policyholder with five claims and five distinct amounts pass a floor of five. Claiming that counts contributors would be worse than the honest row-count limitation. Equal values from distinct entities must not collapse either.
**Configuration impact** The Reinsurance workbook demo needs `Treaty Ref` on each landed object; the V-01/self-contained soak Claims source and external demo Reinsurance Claims source need `policy_id` on claims. The generator declares these keys explicitly. Reinsurance Policies and Reinsurance Recoveries have no aggregate-only columns today and need no key until one is authored. Existing customer sources require their author's declaration; migration does not guess it.

**Validation · 19 October 2026** Completed `npm run check`: both typechecks, lint, production artefact exclusion, 59 conformance checks (54/54 routes), 1,898 tests in 208 files, and the browser/MCP smoke passed; wall 1,733.745s (28m 53.75s). The unchanged bypass inventory separately passed 97 checks with zero regressions. A prior partial gate was stopped and has no passing claim: review found ambiguous generated references for same-named tables in different source catalogs. The dedicated regression at test/sql-treatments.test.ts:208 failed without the qualification fix and passed with it. The subsequent completed-candidate gate is the valid record. No pixel comparisons or baseline recaptures.

### H-05 · The soak observer stops verifying and keeps going
**Customer** On 19 Oct the observer took an HTTP 401 and skipped 3,396 receipt checks while
the run continued and reported. Every governance claim we make rests on these runs, and a
harness that silently stops checking makes a clean result meaningless. Fail the run on any
non-2xx, surface skipped checks at the top of the summary, and fix the underlying auth
expiry.
**Evidence** docs/review/x01-duckdb-binding-upgrade.md
**Status** Done · 19 October 2026 · d55ad1b
**Resolution** Receipt preflight is mandatory; a non-2xx, network or response-contract
failure halts the run with exit 1. Verdict and skipped receipt checks lead the summary.
The normal runner owns Redis, so its FLUSHDB tests cannot erase console sessions.
Receipt-only heartbeats retain idle activity but neither bypass absolute expiry nor
survive revocation; both are tested through production HTTP authentication,
CurrentUserService and real Redis in test/soak-observer-session.test.ts.
**Verification** Full gate passed once: 1,871 tests / 206 files, 59 conformance checks /
54 routes and one browser/MCP smoke path; 1,474.245 seconds. Standalone observer checks:
17 passed. Checked 19 October 2026. No production session policy was changed.

### E-10 · Readiness proves the process is alive, not that it can serve
**Customer (original finding)** Startup opens DuckDB without postgresExtension and /health returns build metadata
without exercising the scanner, so a replaced Engine reports ready while potentially unable to
answer any query that needs Postgres. A missing scanner fails at materialisation, an invalid
configured extension fails when the execution session loads it, and in both cases the operator
sees a recovered Engine and an agent sees a failure. This is the detection gap that sits
alongside E-08's configuration defect; supplying the setting does not close it.
**Fix** Readiness requires the scanner configuration when Postgres scanning is needed, opens
the privileged session, loads the signed extension, attaches the intended source read-only and
materialises a constant SELECT 1, then closes everything. It must never read a customer value:
a probe that reads a real row would be an ungoverned read by the product itself. It runs on
startup and after a replacement, not on every health poll, since each run costs a connection.
Proves one source path at one moment; table permissions and other sources still need their own
checks.
**Original evidence** sidecar/start.ts:37, sidecar/http/server.ts:42,
sidecar/session/infrastructure/duckdb.ts:32 and :62
**Status** Done · Small
**Completion evidence** `64f3982`, checked 2026-10-18 · `sidecar/readiness.ts:20`,
`sidecar/start.ts:38`, `sidecar/http/unavailable.ts:8`. `postgresReadinessSource` is
mandatory and explicit, with no inferred landing/demo target. The startup/replacement
probe loads the signed scanner, attaches read-only and verifies only constant SELECT 1.
Safe failure reasons reach terminal supervisor logs and the console; agent refusal text
and classification stay unchanged, including requests racing a child exit. Health polls
open no source connection. Interrupted requests in the departed child remain G-07.
**Validation** Completed-candidate gate passed: 1,865 domain/integration tests (204 files),
59 conformance checks with 54/54 routes and zero findings, one smoke path; 24m 10.53s.
An earlier incomplete attempt was voided to fix the diagnostic response race; the final
MCP regressions prove identical refusal text and closed refused receipts after either
health check.

### V-02 · Custody leg: release and non-recipient refusal
**Customer** Proves the property custody rests on — an agent can unseal only a packet
addressed to its XQ identity. Approved 2026-10-18 amendment: two working certificates, one
per pool, prove refusal in both cross-pool directions. This does not distinguish agents
sharing the same pool certificate; the original three-certificate run is not claimed.
**Status** Done · Medium
**Evidence** `c00965d`, checked 2026-10-18 · [V-02 run record](review/v02-custody-conformance.md): 40/40 checks;
224 and 226 serve five credentials each; both cross-pool fetches refused with HTTP 403;
rightful retrieval, unsealing, one-time K2 release, revocation and receipts passed.
225 is excluded: its retained HTTP 403 body explicitly refuses the current location.
The failed URL-guard attempt and separately authorized successful resume are both recorded.

**Gate** Passed once: 1,845 domain/integration tests, 54/54 conformance routes with zero
findings, one smoke path; 34m 35.32s. No production source changed.

### V-01 · Ten-agent, two-pool conformance run
**Customer** Proves that ten concurrent agents receive their own pool's column treatments
and cedant row scope, and that binding a source does not inherit another pool's decisions.
This run is also the spine of the demonstration.
**Status** Done · Medium
**Detail** Amended 17 Oct 2026: assertion 1a requires different treatments on the same column
in the two pools; 1b requires an A-only decision to refuse in B with entitlement_missing.
The earlier source-level inheritance prerequisite is superseded, not implemented.
No XQ or custody calls; V-02 is separate. Expectations come only from the reinsurance fixture.
**Evidence** `3f4df43`, checked 17 Oct 2026: ten independent credentials, two cedant
pools, eight concurrent batches, 80 distinct receipts and 1,006 checks passed.
Full gate passed once: 1,845 domain/integration tests, 54/54 conformance routes and
one smoke path; 26m 35.55s. [Fixture, assertions and retained failed attempts](review/v01-ten-agent-conformance.md).

| # | Row | Closed by |
|---|---|---|
| Z-01 | Merge the three outstanding branches | 24bfc6e completes the ordered integration: 0140f42 fast-forward, 4a31c0d probe merge, 24bfc6e deployment-position merge; checked 17 Oct 2026 |
| Z-02 | Preserve the 140-page XQ reference, index and manifest | f4edc83; checked 17 Oct 2026 |
| A8 | docs packaging — stylesheet import and Engine image | API image limitation noted under A3 |
| A10 | Engine registry: creation, verification, assignment routes | distribution remains O3 |
| B1 | Token-domain default | |
| B3 | Binding strategy: inspection before PREPARE, failed binding refuses | |
| E3 | Tokenized ordering refusal | |
| F1 | Conformance typecheck as a gate tier | 2594da3, 49be1db |
| F2 | DuckDB scanner provisioning tooling | environment prerequisite remains |
| G-05 | Credential–certificate association, escrow to stored recipient or refuse | 0140f42, integrated into main by Z-01; checked 17 Oct 2026 |
| — | AddContact enrolment | **Superseded, not done.** No production reference exists; the alias-registration call it would have joined is removed by G-05. |

**Cancelled, not pending:** pixel comparisons · archived custody baselines · the Activity
teardown-stall investigation. Cancellation did not diagnose the historical failures and no
scenario has returned to the gate.

---

## Coverage

What has been audited against this document, and when.

| Area | Last audited | By |
|---|---|---|
| Slice 1 register rows A–F, O | 17 Oct 2026 | code inspection |
| Release custody and XQ integration | 17 Oct 2026 | code inspection and live probe |
| Pools, credentials, certificate association | 17 Oct 2026 | code inspection |

**Not audited, and therefore not represented above:**

- P0–P4 work items, not examined item by item.
- The sidecar track, not examined item by item.

Anything in those two areas may be missing from this document. Z-05 is what removes this
section's dependence on someone remembering to write it.
