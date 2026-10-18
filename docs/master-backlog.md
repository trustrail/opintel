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
   surprise.
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

---

## Now

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

### V-01 · Ten-agent, two-pool conformance run
**Customer** Proves that ten concurrent agents receive their own pool's column treatments
and cedant row scope, and that binding a source does not inherit another pool's decisions.
This run is also the spine of the demonstration.
**Status** In progress · Medium
**Detail** Amended 17 Oct 2026: assertion 1a requires different treatments on the same column
in the two pools; 1b requires an A-only decision to refuse in B with entitlement_missing.
The earlier source-level inheritance prerequisite is superseded, not implemented.
No XQ or custody calls; V-02 is separate. Expectations come only from the reinsurance fixture.

### V-02 · Custody leg: release and non-recipient refusal
**Customer** Proves the property custody rests on — that an agent can unseal only what was
released to it. A shared certificate cannot prove this, so one pool carries a third
certificate held by a single agent.
**Status** Open · Medium · depends on V-01 and three XQ certificates

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
