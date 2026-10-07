# Opintel Slice 1: Implementation and Validation Plan

**Version 2.0.** Pairs with Slice 1 technical documentation v1.1, algorithm specifications v1.2, test specification, master stylesheet.

Supersedes v1.0. Six decisions are now settled and applied: Slice 1 splits into 1a and 1b, calendar estimates are removed, SpiceDB is self-hosted, spreadsheet ingest replaces Parquet as the second connector, tokenization is reviewed by the founder before dependent code, and the demo pack is reshaped around reinsurance spreadsheets.

---

## 0. Ground rules

**A task is done when its tests pass in CI**, not when the code looks right. Every item names the test IDs that prove it.

**No item starts before its dependencies are green.** The order below is a dependency order. It is the only ordering constraint that matters, and it is the reason this plan carries no calendar estimates: sequence is knowable, duration is not.

**Four items are hand-written unless their row records a reviewed delegation.** The tenant wrapper (1.4), the DuckDB two-session construction (S2), the ephemerality proof (S4), and the bypass suite (C.6). A generator produces plausible wrong answers in exactly these places, and a wrong bypass suite passes while proving nothing. Delegation decisions for S2/C.6 and the conditional reviewed-design delegation for S4 are recorded in AGENTS.md and their rows below.

**The stylesheet is not rewritten.** `opintel-master.css` ships unchanged. React components are written to its existing class contract. A class that is not in that file fails the build.

### Settled decisions

| # | Decision | Consequence |
|---|---|---|
| 1 | No calendar estimates. Gates, not weeks | Progress is measured by phase gates passing |
| 2 | **Slice 1 splits into 1a and 1b.** 1a is complete and shippable without prompt mode; 1b adds language | 1a satisfies four of five pilot criteria on its own |
| 3 | **Second connector is spreadsheet ingest**, not Parquet | A landing pipeline inside the customer's environment, writing to their Postgres |
| 4 | Tokenization reviewed by the founder before any dependent code | Construction A v1.3 signed off; 4.3 delegated with immutable reference vectors |
| 5 | **SpiceDB self-hosted** in Slice 1 | Managed AuthZed remains the SOC 2 trigger, not a Slice 1 decision |
| 6 | Bordereaux ingestion is in Slice 1 | Reshapes the data phase and the demo pack |

### Assumptions that remain

| Assumption | If it is wrong |
|---|---|
| A real Postgres and real reinsurance spreadsheets exist before the data phase | Introspection and ingest cannot be validated against mocks |
| The sidecar has a dedicated owner | It is the critical path and the highest technical risk |
| Design decisions are settled before the domain phase completes | Reopening the domain model invalidates work downstream |

---

## 1. Phase structure

**Slice 1a** ends in a product that can be sold, piloted and audited. **Slice 1b** adds natural language.

| Phase | Slice | Ends when |
|---|---|---|
| **P0 Foundation** | 1a | Someone signs in with a link and sees a correctly styled, empty shell |
| **P1 Tenancy** | 1a | A company, a project and an invited colleague exist, with derived permissions |
| **P2 Data** | 1a | A Postgres source is catalogued and spreadsheets land into it, every element undecided |
| **P3 Governance** | 1a | Entitlements set, per-pool views compile, nothing readable by accident |
| **P4 Access** | 1a | An external agent queries through the pool and every request is recorded |
| **P5 Gate 1a** | 1a | Pilot criteria S1 to S4 pass end to end. **Shippable** |
| **P6 Language** | 1b | Plain-language questions answered with the full trace |
| **P7 Gate 1b** | 1b | S5 passes, vocabulary readiness exported, deployment method proven |

The sidecar runs as a parallel track from the start of P2 and must not be compressed into the end of P4.

---

## 2. Slice 1a work items

### P0 Foundation

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 1.1 | Repo skeleton, module boundaries, tsconfig strict, eslint boundary and token rules, dependency-cruiser | none | `src/` tree, configs, CI 1 to 3 | lint and typecheck gate the build |
| 1.2 | Docker Compose: Postgres 16 with pgvector, Redis, SpiceDB self-hosted. Migration runner, up and down | 1.1 | `platform/db`, `migrations/001` | migrations run both ways in CI |
| 1.3 | Shared kernel: `Result`, `DomainError`, branded ids, clock, id factory | 1.1 | `shared/kernel` | every `Result` branch covered |
| 1.4 | **Tenant wrapper** `withTenant` / `withPlatform`, `set_config(...,true)`, pool not exported. **Hand-written** | 1.2, 1.3 | `platform/db/scope.ts` | RLS-01 to RLS-10 |
| 1.5 | Mail port, local file adapter, outbox | 1.1 | `platform/mail` | mail sent after commit only |
| 1.5a | HTTP server, Zod validation at the boundary, error envelope, request id | 1.3, 1.15 | platform/http | error envelope shape, validation rejects at the boundary |
| 1.5b | Redis client and connection lifecycle | 1.2 | platform/redis | connects, reconnects, closes cleanly |
| 1.5c | HTTP routing: a registry mapping method and path to a validated handler | 1.5a | platform/http/router.ts | three handlers on one server, 404 for unknown paths |
| 1.5d | Secret-store port, environment adapter | 1.3 | platform/secrets | resolve returns the secret, a missing one refuses, the secret never reaches a log |
| 1.6 | Identity domain and schema | 1.2, 1.3, 2.1  | `modules/identity` | domain invariants |
| 1.8 | Sessions: Redis, cookie, timeouts, revocation | 1.6 | session store | D-001 to D-011 |
| 1.7 | Magic link: request, callback, device nonce, rate limits, single use | 1.4, 1.5, 1.5a, 1.5b, 1.6, 1.8 | endpoints | B-001 to B-015, A-005, A-006 |
| 1.9 | OIDC with PKCE, account linking on verified email; production service construction, registered start/callback routes and browser proxy | 1.7 | provider adapters and routes | C-001 to C-011; production-factory HTTP round trip into a readable session |
| 1.10 | `/auth/providers` route resolution | 1.7, 1.9 | endpoint | A-001 to A-013 |
| 1.11 | **Design system from the master stylesheet**, ported to its class contract | 1.1 | `shared/ui` | O-001 to O-011 |
| 1.12 | App shell: router, drawer, top bar, error boundaries, toast host | 1.11 | `app/`, shell | shell renders |
| 1.12a | Frontend HTTP client: typed fetch against the API, error envelope to AppError, request id surfaced | 1.5a, 1.11 | src/shared/api | envelope parsed, network failure becomes AppError, request id available to the UI |
| 1.13 | Auth screens | 1.10, 1.11 | four screens | A-014, A-015, B-007 to B-009 |
1.13a | Authenticated route guard: unauthenticated visitors redirect to /sign-in, the intended path is preserved and restored after sign-in | 1.12, 1.13 | app/guard.tsx | an unauthenticated visit to a console route redirects, the path is restored |
| 1.14 | Kitchen sink, visual snapshots, axe and every-screen control conformance in CI | 1.11 | `/dev/kitchen-sink`, rendered-control checker and route coverage gate | O-005 to O-009; unclassified controls and unvisited screen routes fail |
| 1.15 | Observability: OTel, request id, logs with field allowlist | 1.1 | `platform/telemetry` | no customer data in telemetry |

Item 1.15 must wire `EvidencePartitionTelemetryPort` to the customer's chosen
deployment receiver: the unlabelled `opintel_evidence_partition_horizon_months`
gauge and low-horizon, uncovered-current-month and cannot-measure alerts (§8.6).
Until then the port emits structured logs; this does not deliver a ticket or
page. Missing hourly observations must be treated as unknown, never as a
healthy cached gauge. Receiver selection is per deployment, not a product
default.

**Gate.** A new email receives a link, clicks once, lands in the shell. Second click fails. Expired fails. Different browser prompts. Fourth request in fifteen minutes returns 429 without revealing whether the account exists. Kitchen sink matches snapshots at three viewports, zero axe violations.

### P1 Tenancy

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 2.1 | Tenancy and vocabulary domains, and their schema in one migration. company and project reference industry; vocabulary_term, synonym_candidate and embedding reference project, so the dependency is mutual and the tables cannot be split across migrations | 1.4 | modules/tenancy, modules/vocabulary | domain invariants, region immutable, E2-005, E2-011 |
| 2.2 | SpiceDB schema, `AuthorizationPort`, cached snapshot with consistency token | 1.2 | `modules/authz` | E-001 to E-004 |
| 2.3 | Route permission declarations, startup assertion | 2.2 | `platform/http` | a route without a permission fails boot |
| 2.4 | RLS policies on every tenant table, `pg_policies` scan test | 1.4, 2.1 | migrations | RLS-10 |
| 2.5a | Authenticated actor handoff: routes declaring a permission receive actor: CurrentUser, typed so a public-route handler has no actor field | 2.3 | platform/http | a handler on an authenticated route cannot compile without an actor; a public handler has none |
| 2.6a | Relationship outbox dispatcher: row and entry in one transaction, SpiceDB write after commit, command awaits it | 2.2, 2.4 | modules/authz | a create that cannot write its relationship fails rather than returning optimistically |
| 2.6b | POST /companies, POST /projects, PATCH /projects/:id | 2.5a, 2.6a | modules/tenancy | E2-001 to E2-012 |
| 2.6c | List routes: GET /projects, GET /companies | 2.6a | endpoints | E2-017, E2-018 |
| 2.6d | Project chooser, create project, create company screens, and the drawer wired to real projects | 2.6b, 1.12 | screens | E2-019, E2-020, E2-022 |
| 2.7 | Invitations, relationship written on acceptance | 2.2, 1.7 | endpoints | E-010 to E-014 |
| 2.8 | Roles, capability resolution, permission explanation | 2.2 | endpoint | E-005 to E-009 |
| 2.9 | Access screen with derivation, project switcher | 2.8, 1.12 | two screens | E-009, E-015, E-016 |
| 2.10 | Migrate industry: dry run, typed confirmation, entitlements untouched | 2.1, 2.6 | endpoint and dialog | E2-023 to E2-025, E2-028, E2-034 to E2-035 |

**Gate.** A company admin resolves to project admin without a per-project grant. An operator cannot set entitlements, refused at the API. A non-member gets 404. The derivation panel matches SpiceDB's own explanation for three users. An invitation grants nothing until accepted.

### P2 Data, including spreadsheet ingest

The largest change from v1.0. Two connectors, and the second is a pipeline rather than a driver.

**The architecture, stated plainly because it is easy to over-complicate.** Landing is data movement inside the customer's environment: flatten the spreadsheet, write it to their Postgres, done. Opintel has not entered the picture yet and nothing about entitlements or concepts applies. From that point the customer's Postgres is an ordinary data source and the existing machinery takes over unchanged. **A spreadsheet-derived table is not a special case anywhere downstream.**

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 3.1 | Catalogue domain and schema, element identity, `exposed_name` immutable | 2.1 | `modules/catalog` | G-006, G-007, G-012 |
| 3.2 | Namespace and type mapping, normalisation recorded once | 3.1 | `catalog/naming.ts` | G-010 to G-013, R-003 |
| 3.3 | `SourceConnector` port. **All source contact goes through the sidecar** | 3.1, S1 | `modules/sources` | F-002, F-003, F-005, F-006 |
| 3.4 | Postgres connector: test, introspect, sample, estimate | 3.3, S1 | adapter | G-001 to G-005, G-014 to G-016 |
| 3.5 | Secret-store integration, literal-secret constraint | 3.3 | `platform/secrets` | F-005, F-006 |
| 3.6 | Introspection job, state machine, diff, cancel; permission-checked re-run route on an existing source | 3.4 | `jobs/introspect` | G-017, G-018, R-023, F-010 (source status); G-009 diff only |
| **3.7** | **Ingest: watch and identify.** A landing zone in the customer's environment. Identify filing party, period, kind, and whether this is a new filing or a restatement | S1, 3.3 | `modules/ingest` | ING-01 to ING-08 (ING-02 filename/folder only; ING-07 detection and registration only) |
| **3.8** | **Ingest: extract.** Sheet selection, header row detection, merged cells, type inference, malformed file handling | 3.7 | `ingest/extract.ts` | ING-09 to ING-18; ING-02 content inspection |
| **3.9** | **Ingest: landing strategy.** Per-source setting, both implementations, recorded on the source; evidence stamping follows in 5.11 | 3.8 | `ingest/land.ts` | ING-19 to ING-23, ING-25, ING-26; ING-07 landing assertions |
| **3.10** | **Ingest: filing register.** What arrived, when, which strategy, what it superseded | 3.9 | `ingest/register.ts` | ING-27, ING-28, ING-29, ING-31, ING-32 |
| 3.11 | Demo pack: reinsurance spreadsheets landing into a demo Postgres, twelve filing parties, inconsistent formats; resumable provisioning on the reserved source without deleting history | 3.9, 2.1 | `modules/sources/demo` | demo path identical, asserted on the port |
| 3.12 | Data sources screen, connect wizard, origin badges, demo card; safe persisted failure messages, failed-source retry and ordinary re-introspection on every non-archived source | 3.6, 1.11 | screens | F-001, F-004, F-007, O-002 |
| 3.13 | Filings within source detail, expandable per source. Quarantine surfaced on the dashboard and in observations | 3.10, 1.11 | source screen sections | ING-27, ING-28, ING-29, ING-31, ING-32 (ING-30 remains with 4.1) |
| 3.14 | Schema explorer, virtualised, prefix fetch; scoped catalogue endpoint and immutable source aliases | 3.1, 1.11 | screen | G-019, G-020, R-001, R-002 |
| 3.15 | Introspection run and diff screen, live progress through SSE in 3.16 | 3.6 (3.16 upgrades progress transport) | screen | G-003 to G-009 |
| 3.16 | SSE hub, Redis fan-out, snapshot then deltas | 1.2, 1.12 | `platform/sse` | S-008 to S-011 |

**3.8 / ING-17 test placement.** The unchanged 100,000-row CSV heap proof runs in the isolated performance project (`test/performance/ingest-extract.test.ts`), separately after functional tests. Repeated full-run timeouts followed by isolated passes make its 60-second real-time budget unsuitable for the functional suite. Keep the file size, exact row count, sampled 96 MiB heap-growth assertion and timeout; the smaller CSV correctness cases and XLSX streaming proof stay functional. CI already runs `npm run test:performance` serially.

#### The landing strategy, specified

Chosen per source at connection time. **No default.** A consultant chooses deliberately during the deployment rather than inheriting whatever we happened to pick, because the choice changes what a correct answer looks like.

| Strategy | Writes | Restatements | Consequence |
|---|---|---|---|
| `append_as_at` | One table accumulating filings, each row carrying its filing id and as-at date | **Visible.** Both versions present | Temporal questions must state a basis. The as-at column becomes a first-class concept |
| `table_per_filing` | A new table per filing | Implicit, by table | Cross-period comparison is a union the agent constructs |

Recorded on the source **and stamped on every evidence record**, because a number computed under one strategy is not comparable to the same number under the other.

#### What ingest deliberately does not do

- **It does not gate on meaning.** An unrecognised column lands with its raw header. Making it answerable to a business question is vocabulary work, handled in 1b and during the deployment, not a landing concern
- **It does not entitle anything.** Landed columns arrive undecided like every other element
- **It does not leave the customer's environment.** Files are read, flattened and written inside their network. Opintel holds metadata and records only

**On the no-copy claim.** Landing writes data, so "nothing is copied" stops being true without qualification. The defensible statements are that **the query path copies nothing** and that **nothing leaves the customer's environment**. Both hold. Sales material and the threat model say it that way, and a reviewer who finds the unqualified version will discount everything around it.

**Gate.** A real Postgres source is catalogued. 200 tables in under 60 seconds. A re-run produces an empty diff. Adding a column produces one addition. A rename carries identity. A type-family change records the invalidation diff; item 4.1 proves the entitlement deletion that restores undecided. Twelve reinsurance spreadsheets in inconsistent formats land, are catalogued, and every column arrives undecided. Both landing strategies work and are recorded. Credentials appear in no response and no plaintext column.

### P3 Governance

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 5.1 | Pool domain and schema, one current key, grace window | 2.1, 1.6 | `modules/pools` | I-001 (domain/key invariants), I-002 (schema hash-only storage), tenant isolation, E2-027 |
| 4.1 | Entitlement domain. **Undecided is the absence of a row** | 3.1, 5.1  | `modules/entitlements` | H-001, H-004 (absence-of-row prerequisite; DDL in 4.4), H-009 (domain/schema rejection; API in 4.7, UI in 4.8), E2-026, F-008, G-009 (entitlement deletion after the recorded type-family diff), ING-30 and E2-014 (persisted undecided assertions) |
| 4.2 | Five treatment strategies | 4.1 | `entitlements/treatments` | H-002 (value/provenance), H-003/H-004 (omission descriptors), H-005/H-006 (TokenizerPort delegation only), H-007 (masks), H-008 (constraint descriptor); DDL/recompile assertions deferred to 4.4 and 4.9, real token equality to 4.3 |
| 4.3 | **Tokenization at the sidecar read boundary.** A v1.3 construction approved for implementation. | 4.2, 1.4, review | `sidecar/tokenize` | TOK-01 to TOK-15, TOK-17 to TOK-23, TOK-26, TOK-31 to TOK-37 (TOK-33 execution validation only), H-006 (actual token equality). TOK-12 runs separately in CI |
| 4.3a | **Tokenization key escrow and restore rehearsal.** Not the release key custody of Slice 3: this is the per-project HMAC key. Backup before first source, scheduled sentinel restore, superseded keys retained | 4.3 | `sidecar/custody`, `entitlements/key-custody` | TOK-16, TOK-27 to TOK-29 |
| 4.3b | Timestamp and epoch declarations per element, schema timezone inheritance, and decision-time validation | 4.3, 3.1 | `catalog/application/temporal.ts`, `catalog/infrastructure/temporal.ts` | TOK-19 to TOK-22 (persisted declarations; execution in 4.3) |
| 4.3c | Canonicaliser registry, versioned, pure, per element | 4.3 | `sidecar/tokenize/canonicalisers/`, `entitlements/canonicalisers` | TOK-24/TOK-25 (registry/purity/version confirmation); TOK-23/TOK-26 execution in 4.3 |
| 4.3d | Token key screen: key status, rotate, restore, rehearse now, and the K7 warning that a lost key cannot be recovered | 4.3a, 1.12 | `app/custody/screen.tsx` | K7 |
| 4.4 | **Pure view compiler**, emitting read plans, projection-only views and metadata distinguishing undecided from withheld. Approved for implementation | 4.1, 4.2, 4.3b, 4.3c, 3.2 | `entitlements/application/compile.ts` | VC-01 to VC-09, VC-15, VC-16, VC-31 to VC-33, H-003, H-005 |
| 4.5 | Application query-inspection **pre-filter only**, using DuckDB's parse per C.3.1; may refuse, never authorise | 4.4 | `entitlements/application/aggregate.ts`, parser port and infrastructure adapter | VC-10 to VC-13, VC-27, VC-29/VC-30 and H-008 (application pre-filter assertions only); cardinality and authoritative enforcement belong to S2 |
| 4.5a | Identifier resolver consuming `CompileResult.omitted`, returning `object_unavailable` with withheld, undecided or mixed reason; absent is `not_found` | 4.4 | `entitlements/application/resolve.ts` | VC-19 to VC-22 |
| 4.6 | Pattern rules, applied at diff time, provenance recorded | 4.1, 3.6 | `entitlements/rules.ts` | H-013, H-014, R-004 to R-007, R-025 to R-027 |
| 4.7 | Bulk set with justification on clear | 4.1 | endpoint | H-010 to H-012, H-009 (API rejection) |
| 4.8 | Entitlements screen: virtualised tree, select, bulk bar, chips | 4.1, 1.11 | screen | H-016, H-018, H-009 (UI offers no reset) |
| 4.9 | Policy version bump and cache invalidation | 4.4 | `entitlements/version.ts` | M-005, M-006 (session cache assertions VC-17/VC-18 belong to S2), H-002 (recompilation timing) |
| 4.9a | Domain event outbox recovery: scan, retry and dispatch for pending events | 4.6 | Existing completion recovery scan, startup/30-second dispatch and source-request integration; implementation and resolved delivery-pattern decision below | Pending completion replay and idempotent/concurrent delivery in `test/pattern-rules.test.ts`; broader event coverage remains open |

**4.6 / 4.9a ownership.** The domain-event contract requires an outbox and
idempotent handlers. Item 4.6 owns durable `IntrospectionCompleted` pending work,
committed with the catalogue diff, and the rule handler's per-target processing
receipts. Without that durable work, a crash after publication could skip rule
application permanently because the elements would no longer be newly discovered.
These are required correctness within 4.6.

**4.9a implementation recorded.** Retain the recovery mechanism already built:
`sources/infrastructure/introspection-completion-recovery.ts` enumerates projects and selects an available project/company administrator
for tenant-scoped dispatch; `platform/http/start.ts` runs it at startup and every
30 seconds with an in-process overlap guard; `sources/application/source-registration.ts`
invokes pending dispatch during source-request resume. The dispatcher in
`sources/infrastructure/introspection-completed.ts` reads pending events in batches
of 100, invokes the handler and acknowledges delivery only after it finishes.
Failures leave work pending for retry. This is general domain-event outbox
recovery, applicable to every domain event, rather than rule matching. The current
implementation handles `IntrospectionCompleted` only; recording it here does not
claim that every domain event is already wired, or that scheduled recovery has
separate test coverage.

**4.9a convergence decision: two delivery patterns.** The relationship outbox
(2.6a) and mail outbox (1.5) already have their own dispatch. Their common pattern
holds a pending-row lock (`FOR UPDATE SKIP LOCKED`) while performing the external
write/send and recording its acknowledgement in that same database transaction.
Relationship dispatch handles a specific row; mail handles a batch or specific
key. There is no separate database transaction between the dispatch attempt and
its acknowledgement, and the lock prevents concurrent dispatch of that row.
This does **not** make the external effect atomic with the database commit:
SpiceDB or the mail provider can accept work before a crash or commit failure
leaves the outbox row pending. Replay still needs an idempotent external operation
or a delivery idempotency key; the lock alone cannot guarantee exactly-once effects.

Completion delivery uses a different pattern: it reads pending events, commits
individual target outcomes and their processing receipts, then acknowledges the
event in a separate transaction after all targets finish. A crash can leave some
or all target work committed while the event remains pending. On replay, the
handler skips targets whose receipts are already committed and resumes unfinished
targets. Each entitlement or refusal and its receipt commit together, so there is
no gap between a target's database effect and its replay protection.

**This difference is essential under the current aggregate boundaries.** One
introspection event can apply rules to many elements across many pools. That is
many entitlement aggregates, not one atomic act; the repository requires one
aggregate per transaction. Wrapping the whole event in a single transaction to
imitate single-row dispatch would violate that boundary. Holding an event lock
across separate target transactions would still leave committed partial work on
a crash, so it would not remove the need for receipts. Item 4.9a therefore retains
two delivery patterns with this written reason: locked external-operation
dispatch, and multi-aggregate completion with durable per-target receipts and a
separate event acknowledgement. Other domain events must be classified by their
work and transaction boundaries rather than automatically using either pattern.

**4.9a answer: retain two patterns; the convergence question is closed.** Use
locked dispatch for the relationship and mail outboxes, and independently
committed target work with receipts followed by event acknowledgement for
completion delivery. A shared scanner, scheduler or retry interface could reduce
duplication, but would not merge these transaction and replay guarantees. The
project-wide scan, 30-second timer and source-request trigger are incidental
recovery orchestration choices, not a third delivery pattern. No unification of
those interfaces is required to complete 4.9a; this decision retains the implemented
dispatchers and does not generalize them.

**4.5 / S2 ownership (C.3.1).** Item 4.5 performs early refusal only; acceptance is never evidence of permission and the application uses no different parser library. S2 independently enforces C.3, B.4 and B.4a against the sidecar's own parse and binding in `/validate` and `/execute`, using the request's read plan and entitlements. S2 owns both stages of B.4's post-filter cardinality enforcement, including whole-result refusal before release. `/validate` opens no source connection and cannot stand in for the execution-time checks. S3's resource-governance estimates do not defer S2's disclosure checks or create a dependency cycle.

VC-10–VC-14, VC-23–VC-30 and H-008 therefore require authoritative sidecar assertions to be complete; application assertions alone cannot close them. In particular, execution-stage cardinality assertions are S2-only. Item 4.5a's identifier resolver remains separate and does not substitute for DuckDB binding. The interface findings and outstanding implementation gate are recorded in the sidecar track below.

**Gate.** A newly landed spreadsheet column is undecided and unreadable. Setting a treatment recompiles in under two seconds. Withheld and undecided both absent from the DDL and distinguishable in metadata. The same filing party identifier tokenizes identically across two sources. Bulk-to-clear without justification returns 400.

### P4 Access

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 5.2 | Key generation, hashing, shown once, rotation and revocation | 5.1 | `pools/keys.ts` | I-001 (generation and shown once), I-002 (hashing), I-003 (route check), I-015 to I-017 |
| 5.3 | Pool to source binding in SpiceDB, two-check resolution | 5.1, 2.2 | `pools/binding.ts` | I-005, I-006 |
| 5.4 | Agent presence state machine, never silently removed | 5.1, 3.16 | `pools/presence.ts` | I-018 to I-021 |
| 5.5 | MCP server, key auth, tool listing driven by pool config | 5.2, 4.4 | `modules/mcp` | I-004, I-013, I-014, I-023 |
| 5.6 | `describe`: entitled with types, withheld marked, undecided absent | 5.5, 4.4 | tool | I-007, I-008 |
| 5.7 | `query`: SQL subset on the parsed statement, dispatch to sidecar | 5.5, S2 | tool | I-010 to I-012, K-001 to K-009, F-010 (query refusal), J-044/J-045 |
| 5.7a | Distinguish cancellation, deadline and source failure: preserve the first cause across queueing, source reads, engine interruption and transport | 5.7, S2e | `sidecar/session`, `mcp` | A cancelled query, a deadline and an unreachable source each produce their own code and message; a race between them resolves deterministically |
| 5.8 | **Reduction in the text content the model reads.** Hand-reviewed | 5.7 | `mcp/response.ts` | I-009 |
| 5.9 | `explain` dry run, no source contact | 5.7 | tool | N-003 |
| 5.10 | Evidence domain, append-only grants, partitioning | 2.1 | `modules/evidence` | M-001 to M-006 |
| 5.11 | Record writer: per-element treatment, versions, freshness, landing strategy, synthetic derived | 5.10, 5.7, 3.9 | `evidence/write.ts` | M-002, M-011, M-012; ING-24 persisted landing-strategy evidence; TOK-30 persisted token-key version |
| 5.12 | Activity screen, filters, record detail | 5.10, 1.11 | two screens | M-007, M-013 to M-015 |
| 5.13 | Export: streaming NDJSON and CSV, synthetic excluded | 5.10 | endpoint | M-008 to M-010 |
| 5.14 | Pools screens: list, detail with key management, agent twin | 5.2, 5.4 | three screens | I-001 (copy-to-dismiss UI), I-015 to I-022 |
| 5.15 | Dashboard: ratio, spectrum, tiles, feed, pool shields, empty when clean | 4.9, 5.4 | screen | O-001 to O-004 |
| 5.16 | Settings: project, company and personal pages; §5.8 contract reviewed before screen implementation | all above | screens | Q-001–Q-003, Q-006–Q-009, Q-011–Q-019, Q-021–Q-024, Q-025–Q-027 configuration only, Q-031–Q-033, Q-035–Q-038 |
| 5.16a | Notifications and alerts, including digest preferences/delivery; discovery scheduling and daily pool row budgets; admin two-step enforcement requires its own identity contract. **Not in Slice 1a; deferred pending contracts.** | Contracts to be reviewed before implementation | settings and delivery/enforcement | Q-004, Q-005, Q-010, Q-020, Q-028–Q-030, Q-034 |
| 5.17 | Evidence retention into visible per-run rollups, stored redaction with run history, successful-run detail sampling, and forward partition provisioning | 5.10 | jobs | Q-025 to Q-027 |
| 5.18 | SSO enforcement gate: the enabling company administrator must have completed a sign-in through the exact provider and configuration being enforced. Any configuration change invalidates the proof. Verified at write time | 5.16 | `modules/identity` | Enforcement is refused without a verified sign-in through that configuration; a changed client id, secret reference, issuer or scope invalidates it |
| 5.18a | Two-phase enforced SSO configuration rotation: stage a replacement, require the company administrator to complete sign-in through that exact configuration, then atomically activate it. The old configuration remains enforced until activation. Required for ordinary maintenance such as expiring client secrets | 5.18 | `modules/identity` | Successful verification activates the replacement without a window of disabled enforcement; failed or abandoned flows leave the enforced configuration unchanged |
| 5.19 | SSO break-glass: company administrators retain magic links under enforcement, covering provider resolution, link issuance, confirmation and session acceptance. Stated on the enforcement screen and audited on every use | 5.18 | `modules/identity` | An administrator signs in by magic link while enforcement is on; a non-administrator cannot; every use is recorded |
| 5.19b | Invitations list with pending, expired and revoked states and a resend action. Retain revoked invitation history; outstanding invitations disclose no guessed reason for incomplete sign-in | 5.19, 2.7 | invitations screen and supporting API | Pending, expired and revoked invitations remain visible; an administrator can resend; no provider-failure diagnosis is invented |
| 5.22 | Element declaration administration: mounted permissioned routes and production construction; explorer API exposes stored and effective declarations with provenance and source-routed canonicaliser discovery; element and schema declaration panels; atomic epoch/canonicaliser compatibility, effective-behaviour confirmation, qualified Entitlements failures linking to declarations; past evidence retains the key version and declarations in force | 3.14, 4.3b, 4.3c, 4.4, 5.20 | `modules/catalog`, `modules/entitlements`, explorer and evidence | DECL-001 to DECL-009 |
| 5.23 | Isolated tokenization by default: no stored domain derives a reserved project/element identity domain; declared domains override with effective-behaviour confirmation; declaration panel distinguishes the derived value; document and prove rename/replacement identity effects | 5.22 | `modules/catalog`, `modules/entitlements`, explorer | ISO-001 to ISO-004 |
| 5.24 | Token domain assignment history: a domain change appends immutable assignment history; future query staging uses the new domain, with no stored data rewrite. Evidence from before a change remains interpretable against the domain in force then | 5.23 | migrations 062–064, catalog declarations, compilation and evidence | DOMAIN-001 to DOMAIN-003: confirmation explains that previously delivered tokens do not match subsequent tokens and no stored data is rewritten; a past evidence record names the domain version under which its tokens were produced |
| 5.24a | Refuse an unsatisfiable join at inspection: an equality join condition (including implicit WHERE joins) comparing tokenized columns in different domains, or a tokenized column to a clear one, can never match and is detectable from the read plan. Refuse with a message naming both columns and what would make the join possible, and record query and explain refusals as candidates for 5.25 | 5.23 | application pre-filter, engine treatment inspection, durable candidate storage | JOIN-001 to JOIN-006: an unsatisfiable equality join is refused rather than returning zero rows; the refusal names both columns; the attempt is recorded |
| 5.25 | Attempt-backed relationship suggestions: group recorded join attempts into column pairs; compute frequency and recency from attempt rows with explain and query counts distinguishable; three actions (confirm, reject, not sure). Confirming explicitly selects an existing or new shared domain after reviewing all its members and invokes 5.24; tokenized/clear candidates cannot confirm. Not sure persists and later attempts raise it again; confirmed/rejected actor, time and assignment-version history is retained. An unanswered suggestion never changes token behaviour. SQL uses Activity’s existing redaction implementation and project#view_unredacted permission | 5.24, 5.24a | suggestion review, existing evidence redaction and domain migration | SUG-001 to SUG-006: frequencies/recency come from attempts, query/explain remain distinct, tenant-scoped review actions, confirmation invokes versioned domain assignments, SQL follows Activity visibility, unanswered suggestions preserve tokens |
| 5.25a | Value-overlap evidence, diff-time analysis of newly discovered columns, and format-checking join preview. Requires an explicitly authorised source-reading capability: neither the query read plan nor sampling consent authorises this analysis | 5.25, reviewed source-reading authorisation | Design deferred | Blocking question: who authorises these reads, which columns may be read and under which execution/disclosure limits; no analysis until decided. Small source counts suppressed, no values surfaced, zero overlap inconclusive |
| 5.26 | Cross-system identity mapping: source identifier to canonical identifier before tokenization, versioned for reproducibility, with tokens stable while canonical identity is unchanged. The mapping is a cross-system identity table and is custodied accordingly | 5.24 | — | A mapping change regenerates only affected records; the mapping is never readable through the agent interface |

| 5.27 | Visual identity: `docs/visual-language.html` is the specification for six treatment marks as an exposure spectrum, eight object kinds, three request kinds, five actionable states and navigation marks. Shared React components render inline SVG geometry at sizes 12–48 using existing stylesheet tokens, no new colours, in existing containers | Existing console screens; reviewed visual-language specification | Shared mark component set and console placements | Placement rules: kind marks only where kinds are mixed; navigation always carries marks; state is marked only when it changes what someone does; one mark per thing. VIS-001 to VIS-005: verify geometry, token use and placements with the mechanical placement check below, rendered control conformance, accessibility and snapshots at 390 / 900 / 1440. Audit log remains hidden until Slice 3 and prompt mode remains absent; both retain designed marks without being surfaced |

**5.27 construction boundary.** A passive inline SVG mark is geometry, not a control, and needs no new master stylesheet pattern or control-gate registration. It uses existing containers and tokens without new classes. Marks accompanying text are decorative (`aria-hidden="true"`, non-focusable); standalone treatment marks carry `role="img"` and an accessible treatment name, remaining non-focusable; an icon-only control keeps its accessible name on the existing control. Any interactive use must satisfy the existing master control and disclosure contracts: putting an SVG inside a control neither exempts nor authorises that control. The control gate remains unchanged; dedicated visual-identity checks prove geometry and the four placement rules. The language covers the product; the console shows what exists, so designed Audit log and prompt marks do not introduce navigation or features.


**5.27 mechanical placement check.** Alongside visual snapshots, check rendered mark placement: a uniform list carries no kind marks (the entitlements tree is all elements; treatment marks carry its information); a row carries at most one identity mark, whether kind, state or treatment, never both a kind and a state mark; no identity mark appears in a heading or empty state purely to repeat the screen's name. Shared SVG components expose `data-mark` and `data-mark-category` (`kind`, `state`, `treatment`), without introducing a CSS class. List and row boundaries are identifiable through existing semantic markup or data attributes; each row identifies its kind independently of whether it renders a kind mark. Declare a list's kind scope as uniform or mixed from the list's data contract, not merely from its current page or virtualised window. Navigation is an explicit exception to the uniform-list prohibition and always carries its marks. Count marks belonging to each row without counting nested child rows; ordinary control affordances such as disclosure chevrons are not identity marks. Fail duplicate marks, kind marks in uniform lists, and screen-identity marks in headings or empty states. Fixtures cover permitted and forbidden examples, including a uniform entitlements tree, mixed rows, kind-plus-state duplication, nested rows, navigation and virtualisation. These checks are separate from the control conformance gate and require no weakening of it. Rendered metadata makes structural rules mechanically checkable; completeness of list classification and whether a state changes an action still require reviewed fixtures and human judgement. A rendered subset cannot establish the kind composition of unseen rows.


**5.27 current homes.** Drawer destinations use the designed navigation marks, with existing object/navigation marks reused for sub-items. Entitlements, catalogue undecided badges, element evidence, introspection decision changes and Dashboard spectrum labels use treatment marks. Dashboard/Observations findings and quarantines use actionable state marks; Activity uses refused/incomplete marks and stale agent rows use the stale mark. Normal outcomes remain text. Uniform source, engine, pool and key lists have no kind marks; the trees have no element kind marks. Query is currently the only implemented request kind, so a uniform Activity list needs no query kind mark. Dereference has no distinct Activity mode to label, and Prompt remains unsurfaced. Object designs without mixed-object rows are retained without adding redundant marks. Audit log stays hidden until Slice 3; its designed mark creates no destination. Existing screen-name glyphs are removed from empty states; error/loading affordances remain contextual.

**5.24 precedes 5.25.** Confirming a relationship suggestion is a migration, so the versioned assignment and future-query tokenization path must exist before the suggestion can be confirmed. A confirmation screen that cannot carry out what it promises is worse than none. Items 5.25a and 5.26 remain deferred; 5.25 is authorised for attempt-backed implementation; 5.24a supplies detection and recording independently of their migration and review paths.

**5.25 evidence.** An attempted join is stronger evidence than name similarity or value overlap: it records what an agent actually needed rather than what a heuristic guessed. Item 5.24a records the refused attempt; 5.25 presents it for a person's judgement.

**5.25 evidence decision.** No overlap analysis in this item. Unrelated columns can overlap and related columns can have disjoint populations; evidence that looks most analytical can do the least work towards establishing identity. An attempt demonstrates a real need, and the administrator supplies the judgement. Frequency counts attempts, not source rows or independent business needs: explain followed by query may represent one need, so show their counts separately. Stored SQL may contain literals; reuse Activity's redaction policy and implementation under the same project#view_unredacted permission, with no second redaction path. 5.25a needs a distinct reviewed source-reading authorisation; existing read-plan restrictions and sampling consent are not permission for relationship analysis.

**5.25 decision: no automatic domain merges.** Joining two columns asserts that they refer to the same entity, and the agent is the component that cannot make that assertion. An automatic merge would also change the governance model for every other agent in the pool, permanently, with no administrator involved. The judgement stays with a person; the work does not.

**5.25 review decisions and construction.** Data sources → Suggestions is mounted at `/projects/:projectId/relationship-suggestions`. Suggestions group unordered element pairs across the project's pools. Query and explain attempt counts remain distinct; recency comes from the latest attempt. Confirmation requires explicit selection of an existing or new shared domain, names every existing member before selection, and rechecks membership versions and the latest attempt before committing. It changes neither entitlements nor canonicalisation. A tokenized/clear candidate remains visible but cannot be confirmed until both columns are tokenized in every pool that attempted the join. An administrator changes those entitlements separately.

Not sure appends a decision and stays visible; a later attempt raises it again. Confirmed and rejected suggestions retain their attempt and decision histories, including who decided, when, the chosen domain and 5.24 assignment versions. Confirmation appends the review and domain assignment histories in one transaction: no stored data is rewritten. Migration 065 adds append-only tenant-scoped review records. View permission covers cursor-paged suggestions, domain membership and redacted attempts; administration covers decisions. SQL shares Activity's permission and parsed redaction implementation. Decisions refresh suggestions, domain choices, declarations, element lists, entitlements and project statistics, including on a stale-review refusal. Evidence-setting changes invalidate attempt SQL alongside Activity, and attempt SQL uses Activity’s zero-retention browser cache policy. No source values are read.


**5.23 decision.** Implement before production data exists. The default domain is `opintelisolated` followed by the project UUID and element UUID as lowercase hex without hyphens (32 digits each). This fixed-width identity encoding is injective; explicit domains cannot use its reserved prefix. Matched introspections preserve IDs. A stable-reference column rename with `renameHandling=carry` preserves tokens; `new`, a rename without a stable reference, and table/schema renames replace identity and change tokens. Replacement is reported as removal/addition and does not inherit old decisions; pattern rules or configured new-element treatment may subsequently grant new decisions. Exposed-name adoption alone preserves identity. First explicit assignment on an already-tokenized element is now a token change requiring confirmation.

**5.22 decision.** The schema explorer owns declarations; Entitlements links to it. Stored values and effective defaults/inheritance are visibly distinct. Confirmation protects changes to effective tokenization for already-tokenized elements, including first explicit domain assignment, first epoch assignment or disabling default case folding; storage transitions alone do not govern it. Explicit canonicalisers are never silently overridden by epoch edits; compatible joint changes commit atomically. Historical evidence retains the key version and effective declarations used, including when optional successful-run detail is sampled out. See algorithm A.3.1–A.3.2.


**5.18 and 5.19 are separate Slice 1a requirements.** Both must
be complete before the Slice 1a gate: a customer who cannot sign in has no product.
The enforcement gate prevents activation against an unverified configuration;
break-glass provides administrator recovery if the provider later fails. Item
5.18a separately supplies verified configuration rotation under uninterrupted
enforcement; until it lands, configuration changes under enforcement refuse.

5.16 exposes and persists evidence settings; 5.17 owns the execution half of
Q-025–Q-027: retention, stored redaction and capture sampling. Saving configuration
must not claim these jobs are already operating. Notifications, alerts and admin
two-step have no agreed contract and do not block the Slice 1a gate as item 5.16a.
Discovery scheduling and daily pool row budgets are entirely deferred there too:
no inert settings writes or next-run display in 5.16. Scheduling needs an anchor,
timezone and weekly day. Budgets need a day boundary, failed/refused-run consumption,
concurrent reservation/commit and pool override semantics.

**Gate, and this is the Slice 1a gate.** An external agent configured from published documentation only lists its tools, runs `SELECT *` on a table with a withheld column, receives the other columns and is told in text which were withheld. A withheld column returns `element_withheld`, an undecided one `entitlement_missing`, a non-existent one an ordinary error. Key rotation keeps a twenty-agent pool serving with zero failures. Every request produced exactly one immutable record. Pilot criteria S1 through S4 pass.

**Slice 1a is shippable here.** It can be sold, piloted and audited without anything below.

### Coordinated console redesign (5.28–5.33)

The structural specifications are `docs/Dashboard.html`, `docs/Entitlements.html`, `docs/Activity.html`, `docs/Observations.html` and `docs/Suggestions.html` (currently directly under `docs/`, not `docs/design/`). They share a finding card, dense row, segmented toolbar, weighted action bar and inline expansion deliberately. Build the shared patterns first; consumers use those components rather than copying prototype CSS. Existing master tokens, typography, marks and controls govern the implementation. No prototype palette, new colours or parallel class vocabulary.

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 5.28 | Shared structural patterns: reviewed scoped variants of existing master classes and shared React finding cards, dense rows, compact segmented filters, weighted action bars, inline expansion and relationship bands. Existing domain-choice, consequence and spectrum patterns are reused. A development-only preview exercises the common patterns before production screen changes | 5.27 | `shared/ui`, master variants, preview | RED-001–RED-004: controlled keyboard-operable disclosures and filters; placement and control conformance unchanged; responsive names, types and actions preserved; axe and frozen-clock snapshots at 390 / 900 / 1440 |
| 5.29 | Grouped entitlement and agent-demand read model, then Entitlements: group by exposed name across objects, exact explicit member ids, mixed types/treatments visible, By name/By table and decision filters, authoritative totals and Review all; grouped Declarations selects an individual member. Join-attempt demand remains distinguishable from general requests for undecided columns | 5.28, 4.9, 5.24a | tenant-scoped cursor read model and Entitlements | RED-005–RED-008: group membership and scope, mixed decisions, selection beyond a loaded page, atomic existing bulk command and individual declaration navigation; restore bulk-clear justification and mask-kind selection |
| 5.30 | Suggestion enrichment and contextual navigation, then Suggestions: structured column address, exposed type, treatment and effective domain provenance; seven UTC calendar-day attempt trend series with separate query/explain counts (band label: Last 7 days (UTC)); targeted element/pool decision link; shared relationship and consequence presentation. Preserve existing one directly selectable card per existing shared domain with complete membership, a new-domain card/name input, three consequence bullets, typed confirmation, Open/Reviewed resolution and retained review history | 5.29, 5.25 | suggestion read-model enrichment and screen | RED-009–RED-011: query/explain counts stay distinct, contextual lookup and decision links resolve, existing confirmations and SQL visibility remain authoritative; no overlap analysis or source-value reads |
| 5.31 | Cause-grouped observations, durable open/resolved history and Prepare for the operator, then Observations. The action prepares a copyable/downloadable packet: what happened, affected filings and full ids, landing zone ids, and operator-local remediation. The same packet supports one filing or several groups | 5.30, 3.13 | observation read model/history and reader-carried packet | RED-012–RED-014: cause-specific consequences and lifecycle; full ids and engine ownership preserved; packet includes safe metadata only, no file contents/customer-local reason, no delivery, recipient directory or separate Export for operator action |
| 5.32 | Historical Activity summaries, filters and inline detail: object/element search, day summaries, full-record treatment summaries, safe refusal explanation, contextual suggestion lookup and evidence-record links. Planned reads, released elements and omissions stay distinct; incomplete means no completion recorded, not proof nothing was returned | 5.31, 5.12 | evidence read-model enrichment and Activity | RED-015–RED-018: historical snapshots rather than current policy; permission/redaction and sampled-detail limits preserved; no unrelated withheld columns in named-column detail; no kind marks in uniform lists or combined kind/state marks; bounded virtualised expansion |
| 5.33 | Dashboard last: consume destination read models for needs-attention cards, grouped counts, demand, oldest quarantine, suggestion summaries, trends and recent requests. Link recent requests to their evidence records; do not add entitlement-change history/feed events in this redesign | 5.32, 5.15 | shared summary aggregation and Dashboard | RED-019–RED-020: cross-screen counts agree with their destination scope and links; empty when clean, seven-day metrics and honest completeness; distinguish unique elements from pool–element decisions |

**Accepted scope and corrections.** “Send” becomes **Prepare for the operator**. Opintel prepares a packet for the reader to carry; contacting the operator is their process, potentially across organisations. No recipient directory or transmission is introduced. “Export for operator” is dropped as a separate action; several groups use the same packet. Review all, individual member selection for grouped declarations, contextual suggestion lookup and targeted entitlement links stay in scope. Treatment-history reading is separate deferred work, not supplied by today's overwritten entitlement rows or aggregate bulk-decision records. Recent request links go to evidence; the prototype's treatment-change History event is omitted.

Shared mark placement from 5.27 remains binding: no kind marks in Activity's uniform request list, no combined kind/state or treatment/agent marks on one row. Say **No completion recorded**, never infer that nothing was returned. Named-column details do not list unrelated withheld elements; star-expansion omissions retain §2.6's signal. Bulk-clear justification, masked mask-kind selection and new-domain name input are restored even where absent from the drawings. Existing-domain choices remain explicit and reveal every member; tokenized/clear suggestions cannot confirm; Not sure and confirmed/rejected history persist.

**Read-model decisions to resolve in their owning items, before their code.** Define exact exposed-name grouping scope and mixed-member presentation; Review all means an explicit, reviewable member set, not a rule for future columns. Recorded join attempts measure attempted joins, not every undecided-column request; a broader demand claim needs structured capture. Define sensitive-touch semantics (planned/executed/delivered), day grouping versus display timezone, observation resolution facts and summary-count units. Dashboard must consume those decisions, not invent competing counts. Resolved filing history cannot be reconstructed from the current notice payload after a later revision replaces it. Activity summaries come from authorised historical metadata; they do not parse hidden SQL or invent a telemetry statement-shape channel. Retained rollups and uncaptured detail remain visibly incomplete.

**5.29 grouping decision.** Group exact exposed names within the selected pool's active bound sources, narrowed by the source filter. Apply decision and name filters to individual members before grouping. Mixed groups report their distinct type and decision counts on the collapsed row; expansion identifies each member. Bulk actions target only members remaining in scope, and the action bar states that explicit selected-member count, never the unfiltered group total. Review all collects the entire currently undecided scope through cursor pages into a reviewable explicit ID set, not a rule applying to future discoveries. Grouped Declarations chooses one member. By name is the default; By table retains the existing bounded source/schema/object tree, with the same member-level decision and name scope. Its narrow element rows reuse the reviewed catalogue layout and 76px geometry. The approved decisions container applies the existing 820px grouped-row and weighted-bar rules to available screen width, so the 900px viewport cannot squeeze names or consequences into single-character lines. No new class, colour or breakpoint.

**5.29 reader corrections (2026-10-07).** Shared `.trow` identity labels use the approved 13.5px/560 master rule regardless of layout. Existing consumers are Entitlements group/member rows and the grouped example in the shared-pattern preview; `.rec` dense and expansion rows are outside this selector. An expanded member shows the API's separate short exposed object label, with its full column path retained in the title, accessible names and Declarations. Pending counts belong to the Needs a decision tab, whose empty state is shown only when selected. By table counts are labelled tables, not groups or schemas. Source and schema remain distinct address/filter scopes even when their exposed names coincide; no tree flattening decision is made in this correction.

Focused validation: all ten entitlement-read tests, 17 functional browser scenarios, and 12 Linux visual comparisons pass; strict typecheck and lint pass. The visited routes have zero control/placement findings, with partial coverage explicitly reported (not a full route gate). Every screenshot difference was inspected before replacing the affected baselines. Baseline-only commits separate shared row-label typography (including grouped member labels and tab/distribution changes) from the tree's tab-count and table-wording correction. No full gate or completed-item code commit is claimed for this correction.

**Further Entitlements review (2026-10-07, awaiting reader approval).** By name already emitted the shared identity part, but By table retained `.tname .nm` and missed the approved rule. Its labels now use the same identity markup without changing the rule. The pre-existing built bundle also lacked that rule, so it is rebuilt for review. Global column-name filtering and immediate-child branch filtering remain distinct and explicitly labelled. The distribution is reduced to bar/counts/member total beside the title, with Review all outside it. Repeated demo decision justifications are removed from member presentation, not from storage or the clear-decision form. This iteration runs functional, conformance and accessibility checks only; the screen's visual project and baselines wait for explicit reader approval under AGENTS.md.

Review readiness: 16 focused functional scenarios pass, including axe, identity-label computed styles in both paths, responsive checks at 390/900/1440, filter scopes and retained bulk controls. Focused conformance reports zero findings with explicit partial 2/53 route coverage. Typecheck, lint and production build pass; the rebuilt CSS contains the approved identity-label rule. No visual project was run and no baseline regenerated in this iteration.

The demand signal is **Join attempted**, with query and explain counts distinct. A refused join is the only demand record available; a successful element read leaves no such record. Neither a zero count nor absence of a candidate means an element was never requested. Do not widen this signal to “asked for” or general undecided-column demand.

**Shared implementation and validation.** Item 5.28 adds only the scoped variants shown for review: `data-layout`/`data-density`/`data-part` on existing containers, compact selection styling, and the existing 820px responsive breakpoint. No gate exemptions or new CSS classes. Expand through `.toolchip` buttons with `aria-expanded` and `aria-controls`, never native details/summary or a clickable row around nested actions. Preserve names, exposed types and reachable actions at 390px rather than hiding them. Each consumer validates loading/empty/error/ready, accessibility, placement, conformance and deterministic snapshots in its own item; these are not postponed to a final cleanup. Dashboard's cross-screen check compares counts and navigation against the same scoped destinations.

**5.28 implemented (2026-10-06).** Shared components are exported from `shared/ui`; `/dev/shared-patterns` reviews their controlled states. Narrow weighted bars stack count/consequence/actions and become static within their selection scope, preserving readable content. RED-001–RED-004 pass, including keyboard toggles, closed-detail unmounting, selection cancellation, axe and narrow geometry. Full control/placement conformance: 218 tests, 53/53 routes, zero findings. Normal Linux visual run: 84 tests pass (81 existing baselines unchanged, three new preview baselines), no retries. The initial preview caught an invalid article/listitem role and an unreadable narrow bar; both were corrected. Bounds are measured atomically to avoid comparing two animation frames; no tolerance or timeout was changed. Production ports remain items 5.29–5.33.

**5.29 implemented (2026-10-06).** Tenant-scoped group and member routes are mounted through the production entitlement reader, with declared view permission and selection-bound cursors. Entitlements defaults to exact-name groups and Needs a decision, exposes mixed type/decision counts before expansion, distinguishes refused query/explain attempts, and gathers explicit filtered IDs before the existing atomic bulk command. Individual Declarations links, clear justification and mask-kind selection remain available. The approved content-width rule preserves readable names and consequences at 900px; narrow table rows reuse the reviewed 76px catalogue layout.

RED-005–RED-008 pass. Strict and conformance typechecks, lint and production build pass. Full control/placement conformance: 226 tests, 53/53 routes, zero findings, no retries. Full Linux visual comparison: 87 tests pass, no retries; nine reviewed Entitlements images are isolated in baseline-only commit `e3ccada`. After the final contract correction, 20 affected functional/visual cases (including the real application/Engine declaration path) pass without baseline changes or retries. The completed normal suite first found one failure: I-003 reserved `key` for credential-bearing response fields. Renaming the group identifier to `groupKey` corrected the production contract; the scan stayed unchanged. Focused integration/schema verification: 34/34. Final full suite, with verbose reporting only: 163 files and 1,579 tests pass. Two earlier silent runs were interrupted without summaries and are inconclusive, not passes; the direct run demonstrated that silence alone did not establish a stall. No timeout, threshold, performance test or applied migration was changed.

---

## 3. Slice 1b work items

Everything here is natural language. Nothing above depends on anything below, which is what makes 1a shippable on its own.

### P6 Language

**E.6 estimator ownership.** Query-cardinality estimation serves L2 prompt
confirmation only and moves with its consumer to Slice 1b, item 6.11. Its
arithmetic and safe/large/huge band boundaries are unspecified; resolve them
with the prompt pipeline rather than designing an early contract the consumer
will need to change. CLS-15 is proved in 6.11. This is separate from S2d's B.4
disclosure group sizes and S2e's post-pushdown staging scan admission. J-021
cancellation and J-025 bounded concurrency are already implemented in S2e;
S3 does not reimplement them.

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 6.1 | Vocabulary domain: four term kinds, project overrides shadow industry | 2.1 | `modules/vocabulary` | R-021, E2-028 |
| 6.2 | Effective vocabulary merge, server side, `source` per term | 6.1 | read model | R-021 |
| 6.3 | Retrieval: embedding table, HNSW, `RetrievalPort`, content hash | 6.1 | `modules/retrieval` | T-001 to T-027 |
| 6.4 | Re-embedding jobs, model versioning, backfill and rollback | 6.3 | jobs | T-011 to T-019 |
| 6.5 | PAL: model pinned, prompts versioned and stored | 1.1 | `platform/pal` | CLS-01 |
| 6.6 | Classifier: CIL schema, malformed is a refusal not a repair | 6.5, 6.2 | `querying/classify.ts` | CLS-01 to CLS-04 |
| 6.7 | Metric recovery, thresholds as configuration, strict boundaries | 6.3, 6.6 | `querying/recover.ts` | CLS-05 to CLS-07, T-001 to T-008 |
| 6.8 | Parameter value resolution: categorical value maps, then string distance for typos | 6.6, 3.4 | `querying/values.ts` | CLS-08, CLS-09, CLS-18 to CLS-20, L-006, L-007 |
| 6.9 | Source resolution by matching. Two equal join paths refuse and name both | 6.6, 3.1 | `querying/sources.ts` | CLS-11, CLS-12, L-014 to L-016 |
| 6.10 | Composition, grain rule required on measures | 6.9, 6.1 | `querying/compose.ts` | CLS-13, L-013 |
| 6.11 | QQC L1, L2, L3, rewrite once; E.6 deterministic query-cardinality estimator from statistics and join fan-out, bands and L2 confirmation | 6.10 | `querying/qqc.ts`, L2 estimator | CLS-14 to CLS-16, L-017 to L-019; CLS-15 is proved here by confirmation above the threshold with no execution |
| 6.11a | **L3 adversarial corpus**, gating CI and any model pin change | 6.11 | `querying/qqc-corpus/` | CLS-21 to CLS-26 |
| 6.12 | Durable clarification: pause, resume, TTL, survives restart | 6.8 | `querying/clarify.ts` | L-008 to L-010, CLS-10 |
| 6.13 | Clarification policy per pool, ambiguities collected and asked once | 6.12, 5.1 | setting and logic | CLR-01 to CLR-05 |
| 6.14 | `ask` and `respond_clarification` tools | 6.12, 5.5 | tools | L-001 to L-005 |
| 6.15 | Workbench: prompt panel, stage rail, result, five-part trace | 6.11, 1.11 | screen | N-001 to N-011 |
| 6.16 | Vocabulary screen with readiness, synonym candidates | 6.2, 6.7 | two screens | CLR-06, R-024 |
| 6.17 | Vocabulary export and discovery coverage | 6.2 | endpoints and screen | CLR-07, CLR-08 |
| 6.18 | Discovery question set seeded for reinsurance | 6.1 | seed | CLR-08 |
| **6.19** | **Concepts over landed spreadsheet columns.** A filing party header maps to a term like any other column | 6.1, 3.9 | vocabulary mappings | ING-33 to ING-36 |

**Gate.** A new project answers a question on its first day from inherited vocabulary alone. The same prompt with the same vocabulary version produces identical CIL across ten runs. A misspelled parameter clarifies with real values and real frequencies. A measure with no grain rule refuses composition. A pool set to refuse returns immediately with every ambiguity named. A question answered from a landed bordereau resolves through the same path as one from a native table. Pilot criterion S5 passes.

---

## 4. Sidecar track, parallel from P2

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| S1 | Runnable host, validated config, pinned mutual TLS; `/health`, `/test-connection`, `/introspect`, `/sample` with consent, `/estimate`; audit and disconnect cancellation | 1.1 | sidecar repo | G-014, G-015, J-001, J-002 |
| **S1b** | **Landing runtime.** Spreadsheet read, flatten, write to the customer's Postgres. Runs in their environment, reads files there, never transmits them | S1, 3.8 | `sidecar/ingest` | ING-09 to ING-23, ING-25, ING-26 (ING-24: 5.11) |
| S2a | Two-session construction and hardening. lock_configuration last | S1 | sidecar/session | J-013, J-014, J-020; runtime statement-log assertion that lock_configuration is last before agent SQL |
| S2b | **Bypass suite from docs/bypass-attacks.md; preserve every attack** | S2a | test/bypass | J-004 to J-018, J-020, J-027 to J-057; J-044/J-045 authenticated attacks supplied by 5.7 |
| S2c | Parse, serialize, explicit subset inspection, then PREPARE binding and retained-handle execution | S2a | sidecar/sql | C.3 refusals, J-015 to J-018; no prohibited statement reaches prepare/execute |
| S2d | Authoritative treatment enforcement: aggregate-only two stages, token ordering | S2c, 4.4 | sidecar/sql | VC-10 to VC-14, VC-23 to VC-30 |
| S2e | Staging paths, execute, cancellation, governance, ephemerality | S2c | sidecar/session | J-022 onward, C.4, C.5 |
| S3 | Shared source connection ceiling: connector operations and staged queries use the same globally unique sourceId key, replacing the connector's projectId:sourceId key; one source has one counter | S2e | `sidecar/infrastructure/postgres-connector.ts`, cross-path ceiling regression tests | Concurrent introspection and staged-query work against one source cannot exceed its configured ceiling, whichever path enters first; releasing the lease permits the other path |
| **S2b** | **Streaming execution path — deferred until after S2e staged execution**, condition evaluated conservatively, same bypass suite run against it | S2 | `sidecar/stream.ts` | bypass cases 11 to 14 |
| S4 | **Ephemerality proof**, sentinel scan of disk and mapped memory. **Delegated by reviewed decision; AGENTS.md conditions and C.5 design apply** | S2 | Linux test harness | J-019 (requires staged data to scan), TOK-38 (with S2 staging); live positive controls, write observation, complete declared coverage and separate memory-residual reporting |
| S4a | Sanitise logged exceptions independently of S4: retain only a safe type, a message from the known-safe set and a sanitised stack; withhold all other content with explicit markers. Raw exception messages and stack headers can carry engine values, constraint rows or SQL literals. Include migration and schema-loader CLI failure sinks; suppressed native diagnosis requires the database or SpiceDB server log. Startup configuration field paths stay by decision: paths are not values | 1.1 | `platform/http`, shared exception logging, migration and schema-loader CLIs | Engine errors, constraint violations and parse errors containing sentinel values emit no values; only the allowlisted type/message and safe stack frames are logged, including CLI failure output |
| S4b | Error-classification correctness across the full audited inventory: classify by structured code, type or `error_type` wherever the engine exposes one; where it does not, pin the wording match with a test against the current engine build that fails if its wording changes, so an upgrade reports a broken classifier rather than silently misclassifying. Cover all six DuckDB-dependent sites, including C.3 unsupported-statement and binding-failure refusal decisions. Keep the connection classifier (peer wording) and legacy ingest fallback (our own wording) in scope and report them separately. Capture the complete message, stack and cause chain at the native append catch, before application wrapping, into a private test artifact outside production logs and telemetry. Any sentinel values that capture writes remain visible to the ephemerality proof and are never exempted | S4 | `sidecar/session`, `sidecar/execution`, source connection classifier, ingest fallback, S4 harness | A memory refusal classifies as memory exhaustion, not source_unavailable; each engine classifier uses structured information where exposed, otherwise a current-build test pins its wording and refusal branch; C.3 refusal semantics remain correct; peer-wording and own-wording classifiers are verified and reported separately; the capture artifact is scanned like any other sink |
**Deployment models — one codebase.** Opintel supports both models below.
The application and engine code is the same; the network requirements are not.

| Model | Placement and agent path | Reachability assumption | Certificate distribution and engine operation |
|---|---|---|---|
| Multi-tenant | Opintel hosts the application; engines run in each customer's network. The agent connects to the hosted MCP endpoint, which dispatches into the customer's network to execute | The hosted application needs a customer-approved path to its engines. This is 5.20's open reachability question and the constraint most likely to be refused by a customer's network team. No inbound-access solution is assumed | Opintel operates the hosted application; the customer or its appointed operator operates the engine. Application/engine public certificates, trust material and expected pins must be distributed through authenticated provisioning across the organisational boundary; private keys remain with their respective endpoint operators. S5 must document responsibilities for provisioning and rotation; the distribution mechanism remains to be decided |
| Single-tenant | Application and engines run inside the customer's network; the agent connects to the customer's MCP endpoint. Nothing crosses an organisational boundary | Internal application-to-engine routing is required, including between any customer network segments. The hosted-application-to-customer-network reachability question does not arise | The customer or its appointed operators operate the application and engines and distribute certificates, trust material and expected pins internally. Private keys remain with their endpoint operators. S5 must document internal provisioning and rotation responsibilities; the distribution mechanism remains to be decided |

**S5 packages for both models**, using the same codebase and documenting the
different network, certificate-distribution and operating assumptions. Packaging
did not settle reachability or registration. The subsequent 5.20 decision chooses single-tenant direct private routing and operator registration; the multi-tenant proposal remains deferred.

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| S5 | Package both multi-tenant and single-tenant deployments: VNet mode, OCI image, egress restricted to declared source and receipt hosts; read-only root, `/tmp`, `/dev/shm`, non-root, no swap/core; only `/audit`, `/custody`, optional `/ingest` writable; converge S4 onto shipping image with external controller; document reachability, certificate distribution and engine-operator responsibilities for each | S2 | packaging | SD-005 subset; both deployment models have explicit network and operating prerequisites, with multi-tenant reachability still subject to 5.20's decision |
| 5.20 | Single-tenant engine registry: project engines with private HTTPS address, SHA-256 certificate pin, verified contract and last-seen health; register then test connection before assigning sources; route introspection/query by source and custody by the designated verified engine; primary-key sentinel/version gates tokenized-source assignment and tokenized execution; Settings lists engines, health and sources; startup and a read-only CLI expose the certificate pin; migrate every client-file reader | S5, 5.16 | `modules/engines`, screen, migrations 057–058 | Missing engine is named; wrong pin fails verification before use; contract mismatch refuses; keys mismatching project metadata cannot produce tokens; sources and certificates cannot cross projects |
| 5.21 | Multi-engine token-key distribution and rotation coordination. Until reviewed and implemented, customer operators provision matching project key versions themselves. 5.20 detects and refuses mismatches; it never distributes or repairs keys | 5.20, 4.3a | Key management design, custody adapters | Provisioned engines share the recorded sentinel; coordinated rotation retains history and fails closed |

S5's package is in [deploy/engine/README.md](../deploy/engine/README.md).
[Its local review](review/s5-packaging.md) records the complete SD-005/S4 run
against the exact shipping image, shared runtime enforcement, unsuppressed
memory findings and both deployment models' operating prerequisites.

S4's runner and coverage contract are in [scripts/ephemerality/README.md](../scripts/ephemerality/README.md); [the review report](review/s4-ephemerality.md) records the local results, unsuppressed memory residuals and remaining deployment limits. Its separate Linux CI gate is required before the item is marked done.

**Slice 1 deployment assumption.** Slice 1 assumes a single deployment: one
application and one Engine, configured in files. This is sufficient to build and
prove everything Slice 1 claims. It is insufficient for a second customer or a
customer with sources in two network segments. Item 5.20's Engine registry closes
that gap. It is deployment and operations work in the sidecar track, dependent on
S5's packaging and the reachability decision, and is a prerequisite for a first
deployment rather than for Slice 1. The chosen 5.20 implementation is single-tenant: the application dials private engine listeners and operators register engines in Settings. The multi-tenant outbound-connector/enrollment proposal is considered, not chosen; see review/deferred.md.

**The sidecar is the critical path and the highest technical risk.** S1b is new in v2.0 and it is the right home for landing: the sidecar already runs inside the customer's environment, already holds credentials they control, and already sends nothing out. Putting ingest anywhere else would break the claim that files never leave their network.

**S2a implementation.** `sidecar/session` constructs separate in-memory engine
instances, applies revised C.2 in order (privileged external access stays on per
C.1), executes raw agent SQL only in the agent instance, and closes both in
`finally`. Its uninspected execution seam is documented in
[the session interface](../sidecar/session/README.md) and is not mounted on HTTP.
The driver statement log proves configuration lock is last before agent SQL.
J-013/J-014 exercise native refusals; J-020 forces memory exhaustion with spill
disabled. This does not prove S2c's `sql_not_permitted` envelope for J-015–J-018,
or S4's staged-data sentinel scan for J-019. No parsing, treatment enforcement,
staging or bypass-suite implementation is included.

### DuckDB inspection interface verification — 2026-09-26

Verified with the upstream **v1.4.3 CLI, build `d1dc88f950`**, in a temporary in-memory database, and the matching tagged source. The subsequent 4.5 application adapter pins `@duckdb/node-api` to `1.4.3-r.3`, reporting `v1.4.3/d1dc88f950`; it only serializes SQL supplied as a bound VARCHAR argument in an empty parser instance. This does not implement S2 or choose its binding mechanism.

| Question | Finding |
|---|---|
| Does SQL-to-JSON cover C.3's statement families? | Probes of `SELECT amount FROM pool.public.orders`, `WITH q AS (SELECT amount FROM pool.public.orders) SELECT * FROM q`, `VALUES (1), (2)`, and `DESCRIBE pool.public.orders` all returned `error: false`. `DESCRIBE SELECT ...` also serialized. `WITH` and `VALUES` are internally SELECT nodes; object `DESCRIBE` is a SELECT node containing `SHOW_REF`. Thus all four named families are represented in this build, despite the documentation's “SELECT statements” wording. |
| Does that prove every construct is supported? | No. Additional probes covering joins, a nested subquery, grouping/HAVING, ordering/LIMIT, UNION ALL and a window aggregate serialized successfully, but these are representative coverage, not an exhaustive permitted-subset proof. Every node and nested construct still needs complete interpretation or refusal. `ATTACH` returned `error: true`; successful serialization alone is never the subset check. |
| Is identifier binding included? | No. `SELECT missing FROM nonexistent` serialized successfully in the empty database. The implementation calls `Parser::ParseQuery` and serializes the parsed `SelectStatement`, without binding the SQL supplied as its argument. The JSON does not resolve references to pool elements or supply column lineage. |
| Can binding be obtained elsewhere? | DuckDB's C++ internals expose bound column references with table/column indexes and correlation depth, and `Connection::ExtractPlan` exposes a logical plan. These are possible integration surfaces, not a verified inspection/execution hook. The documented C prepared-statement API exposes parameter and result metadata, not the complete bound expression tree; parameter binding is not identifier binding. C++ API stability is not guaranteed. |
| Can serialized JSON simply be executed after inspection? | Not as proof of C.3.1. The documented table function `json_execute_serialized_sql` uses a separate query context; its pragma form uses the same context but still does not provide bound-tree inspection. Neither establishes that the exact bound statement inspected is the one executed. |

Sources: [SQL/JSON contract](https://duckdb.org/docs/current/data/json/sql_to_and_from_json), [v1.4.3 serializer](https://github.com/duckdb/duckdb/blob/v1.4.3/extension/json/json_functions/json_serialize_sql.cpp), [SELECT/VALUES/CTE transformation](https://github.com/duckdb/duckdb/blob/v1.4.3/src/parser/transform/statement/transform_select_node.cpp), [DESCRIBE transformation](https://github.com/duckdb/duckdb/blob/v1.4.3/src/parser/transform/statement/transform_show.cpp), [bound column references](https://github.com/duckdb/duckdb/blob/v1.4.3/src/include/duckdb/planner/expression/bound_columnref_expression.hpp), [connection API](https://github.com/duckdb/duckdb/blob/v1.4.3/src/include/duckdb/main/connection.hpp), [C prepared-statement API](https://duckdb.org/docs/current/clients/c/prepared), [C++ stability warning](https://duckdb.org/docs/current/clients/cpp).

**S2 binding decision.** C.3.1 now fixes the order: parse, serialize, explicit
subset inspection, then PREPARE to prove binding in the contained agent
session, followed by execution of the retained handle. Preparation is not an
inert classification probe. The approved parser/serialization proof categories
and coverage limits are recorded in [interface verification](review/s2c-parser-interface.md).
S2c implements this boundary in `sidecar/sql`; [verification results](review/s2c-results.md)
distinguish closed subset attacks from S2d treatments, missing 5.7 transport,
and the resource-envelope assertion. J-052 now proves the explicitly approved
PIVOT/UNPIVOT refusal behavior. J-021 remains C.4 resource
governance in S2e, outside S2c. S2d now enforces treatments against the
sidecar's own tree and binding; S2e supplies staged objects and governance.

**S2d implementation.** Authoritative treatment inspection, request-policy and
session-column agreement, both cardinality stages, and whole-result refusal are
implemented in `sidecar/sql`. Uncertain per-group estimates require Stage 2.
[S2d results](review/s2d-results.md) records supported shapes, conservative
refusals, VC coverage and closure of J-035–J-039. Their bypass exemptions are
removed; only the 5.7 transport prerequisites remain open after S2e closes the resource envelope.

---

## 5. New test areas

Thirty-six cases for ingest, to be added to the test specification.

| Range | Area | Notable cases |
|---|---|---|
| ING-01 to ING-08 | Watch and identify | Filing party, period and kind identified from a file with no metadata. A restatement recognised as such. An unidentifiable file quarantined with a reason, never guessed |
| ING-09 to ING-18 | Extract | Header row not first. Merged cells. Twelve sheets, one relevant. Mixed types in a column. A malformed file fails without taking the batch with it |
| ING-19 to ING-23, ING-25, ING-26 | Landing strategy (ING-24 evidence stamping: 5.11) | Both strategies land the same file correctly. Strategy recorded on the source. A restatement under `append_as_at` leaves both versions present and queryable. Under `table_per_filing` it lands separately |
| ING-27 to ING-32 | Filing register | What arrived, from whom, when, under which strategy, what it superseded. Reconcilable against the landing zone |
| ING-33 to ING-36 | Concepts over landed columns *(1b)* | A filing party header maps to a term. An unmapped header is refused and named, not guessed. Two filing parties' different headers map to one term and aggregate correctly |

**ING-08 and ING-26 are the two that matter most.** An unidentifiable file must be quarantined rather than guessed at, because a bordereau attributed to the wrong filing party is worse than one that did not land. And a restatement must be visibly a restatement, because a reserve that moved silently is a wrong number nobody can trace.

---

## 6. Validation strategy

### 6.1 Four levels of proof

**Bypass regression gate.** `test/bypass/` runs in its own Vitest project via
`npm run test:bypass`, separate from `npm test`; CI runs both. The reviewed
`test/bypass/open-attacks.json` registers current open cases by exact assertion,
observation and owner (no open exemptions after 5.7). Expected
failures print as an owned work queue. New failures or succeeding attacks,
missing/skipped tests, changed failure reasons, unhandled errors and stale
entries that now pass fail the build. Owners remove exemptions when their
items land. No blanket CI failure allowance or skipped attack is used.

| Level | Proves | When |
|---|---|---|
| Test IDs per item | The item does what was specified | Continuously |
| Phase gate | The phase is demonstrable | End of each phase |
| Traceability matrix | Nothing in the inventory is untested | CI, every commit |
| Slice gate | The customer criteria pass | End of 1a, end of 1b |

### 6.2 Test-first, non-negotiable

Seven items. A test written after the code tends to assert what the code does rather than what was required.

`1.4` tenant wrapper · `4.3` tokenization · `4.4` view compiler · `5.8` reduction in text content · `S2` DuckDB session · `S4` ephemerality · `3.9` landing strategy

### 6.3 Tests that catch a silent failure

Ranked by what they prevent. Each fails silently in production if absent.

| Test | Prevents |
|---|---|
| J-004 to J-018, bypass suite | Every entitlement being decoration |
| RLS-01 to RLS-10 | One customer reading another's metadata |
| TOK-01, TOK-02, TOK-10 | Cross-source joins breaking, or tokens being reversible |
| VC-01 to VC-04 | An undecided element being readable |
| M-003, M-004 | Evidence being alterable |
| I-009, 5.8 | An agent reasoning confidently over a partial picture |
| **ING-08** | A bordereau attributed to the wrong filing party |
| **ING-26** | A restatement disappearing without trace |
| CLS-01 *(1b)* | Non-reproducible interpretation, which voids the record |
| J-019 | Data persisting after a response |

### 6.4 Fixtures

One seeded project, deterministic, shared by every test and by evaluation. **The demo pack is the same artifact a customer connects**, so a bug in it is a bug in the product.

The reinsurance demo pack is now **twelve cedant spreadsheets in inconsistent formats**, landing into a demo Postgres. That makes the fixture exercise the ingest path rather than sidestepping it, and it means the pilot demonstrates the real shape of the problem.

A real Postgres and real reinsurance spreadsheets, with their genuine messiness, must exist before P2 completes. Ingest cannot be validated against files we invented.

### 6.5 Not tested in Slice 1

Multi-AZ failover, on-premises deployment, SAML, SCIM, sustained load beyond the budgets, penetration testing, and the SOC 2 control set beyond evidence collection.


### 6.6 Validation during implementation

Approved scheduling: iterate with affected tests, then run strict typecheck and lint after a coherent batch. Run every full gate once on the completed candidate before its completed-item commit. Do not run a full gate while a known defect is outstanding; fix and verify it locally first. If a final gate finds a defect, fix it with focused verification and repeat the affected full gate. Run commands sequentially. Quiet output from a twelve-minute suite is expected and is not grounds for interrupting it.

| Change | Iteration checks |
|---|---|
| Documentation | Diff and specification consistency |
| UI copy | Affected functional/axe cases and frozen-clock snapshots at 390 / 900 / 1440 |
| Screen structure | Affected functional, control/placement, axe and responsive snapshots |
| Shared CSS/component | Component cases and representative affected screens; broaden when a difference is unexplained |
| Backend route/read | Named tests, affected integration, permissions, error envelope and response-schema checks |
| Migration/tenant | Up/down in dependency order, RLS, grants and affected integration |
| Engine SQL/token/governance | Affected tests, bypass at a stable checkpoint and relevant resource/ephemerality proofs |
| Performance | Relevant isolated performance project, unchanged thresholds |

`npm test -- <file>` passes only the supplied selection to Vitest; the default `test/` scope lives in Vitest's include configuration, not an additional OR filter. `npm run test:performance -- <file>` likewise remains focused within its own project.

**Database deadline controls (approved 2026-10-07).** The normal, bypass
and performance Vitest projects use a test-only database runner. Active SQL
is cancelled on the test/hook abort signal; server statement timeouts use
the remaining phase budget. Cleanup has its own bounded barrier outside
that budget: reserving one second by subtracting it from every SQL deadline
would silently turn a five-second functional budget into four. Cleanup is
awaited outside Vitest's timed callback before another hook or test can run:
cancel, settle, rollback/retire the connection, then confirm its backend is
gone, using a separate control connection and PID plus backend birth.
Termination is the fallback. Unconfirmed cleanup stops the whole run; it
does not generate downstream reset failures. TRUNCATE has a one-second
lock-acquisition timeout with an explicit blocked-reset failure and run stop;
that does not shorten its execution allowance. The hand-written production
scope wrapper and all existing Vitest budgets remain unchanged. Native
positive controls and intentional child-run failures prove the barrier and
the stop, including an idle transaction and refusal of late database work.

R-002 remains the specified 50,000-element performance case and moves to
`test/performance/catalog-tree.test.ts`. A 1,001-element functional companion
retains its pagination, clamp and cursor-scope assertions. Volume is not
necessary for those assertions and consuming half the body budget on a bulk
INSERT was setup sensitivity, separate from the uncancelled-work cascade.

`npm run test:browser` runs functional and visual scenarios once each, with the control and mark observers attached to both. Screenshot comparisons remain active. The combined report requires all 53 current routes (derived from routing, so additions also become required). This replaces the independent conformance replay in CI and `npm run check`; `test:conformance` remains available for diagnostic observation without snapshot comparison. Focused Docker invocations report partial coverage and list unvisited routes without treating their absence as a defect; all visited-state assertions and findings still fail. A partial run never establishes the full route gate. The report records scope and coverage completeness separately from scenario status.

Known M-015/G-019 performance failures remain failures. The full command short-circuits on failure; report exactly which gates ran and do not claim later gates passed. No assertions, thresholds or snapshot review requirements are reduced by this schedule.

**Scheduling changes verified (2026-10-06).** Focused npm selection ran one file/four tests; focused conformance passed with explicit partial 1/53 coverage. Combined browser validation: 226 tests, full 53/53 routes, zero findings, no retries, unchanged snapshots, 15.4 minutes. Strict/conformance typechecks, lint and build pass. Normal Vitest preserved the full selection (164 files/1,583 tests), but failed 18 cases in 937.12s. The narrower reruns passed catalog/tenancy, then token history in isolation; they do not establish a passing full gate. See deferred.md's consolidated timing record and invocation-correction results. Full validation has not been repeated while these failures remain unresolved, and no completed-item commit has been made.


---

## 7. Risk register

Ranked by expected cost.

| # | Risk | Why it is likely | Early warning | Response |
|---|---|---|---|---|
| 1 | **Sidecar isolation is wrong in a way tests do not catch** | The bypass suite is only as good as its list, and a DuckDB upgrade can open a route nobody enumerated | A bypass found in review rather than by a test | Hand-write S2 and the suite. Add every new bypass in the same pull request as its fix. Re-run the full suite on every DuckDB upgrade |
| 2 | **Real bordereaux break the ingest assumptions** | Every filing party differs, and the messiness is the problem rather than an edge case | The first real file, in P2 | Get real files before P2 completes. Quarantine rather than guess. Expect the long tail to continue past the gate |
| 3 | **Introspection meets a real schema and breaks** | Views without lineage, quoted identifiers, vendor types, very wide tables | First real connection | A real Postgres before P2. Budget for the tail |
| 4 | **Landing strategy chosen wrongly for a customer** | It is a judgement call made early, and it changes what every number means | A customer asking why two periods disagree | No default. A consultant chooses deliberately. Strategy stamped on every record so a wrong choice is at least visible |
| 5 | **Tokenization key management is fiddlier than specified** | Secret storage, per-project keys, sidecar resolution at execution, rotation semantics | P3 | Prototype early, ahead of need. Blocked on review anyway |
| 6 | **The frontend drifts from the master stylesheet** | A generator or a hurried engineer adds a class rather than reusing one | New classes outside `opintel-master.css` | Lint rule: a class not in the master file fails the build |
| 7 | **Classification is not reproducible enough** *(1b)* | Determinism at temperature 0 is assumed, not guaranteed, across provider updates | CLS-01 flaky | Pin the model. Store the prompt. If it flakes, the record must state the model version and reproducibility becomes best-effort |
| 8 | **SpiceDB operational burden** | Self-hosting an unfamiliar system while building everything else | Time lost in P1 | Timebox. Managed AuthZed is the fallback and the SOC 2 trigger anyway |
| 9 | **Token key loss** | HMAC is irreversible. Loss severs every join and makes every historical record unverifiable | A restore rehearsal failing, or never having run | Backup before the first source connects. Scheduled sentinel restore. Superseded keys retained, never deleted |
| 10 | **L3 approves a plausible wrong answer** *(1b)* | It is the only non-deterministic control in the system, and its failure is silent | A wrong answer reaching a customer that L3 approved | A fixed adversarial corpus gating CI and any model pin change. Every production miss added to it with its fix |
| 11 | **The streaming path is loosened to make a slow query fast** | The pressure will be real and the condition looks conservative | A change to `streamingPermitted` not accompanied by a bypass run | Staged path ships first. Streaming added afterwards behind the same suite, run against both paths |

**Risk 1 is the one that ends the company if it lands badly**, because the product's entire claim rests on it. It deserves disproportionate attention.

**Risk 2 is new and underestimated by everyone who has not done it.** Bordereaux normalisation is famously the hardest unglamorous problem in the market, which is exactly why owning it is worth something.

---

## 8. The cut plan

The 1a and 1b split replaces most of what the cut plan used to do. What remains:

| If behind | Cut | Consequence |
|---|---|---|
| Slightly | **Ship 1a, defer 1b** | Already the structure. Query mode satisfies four of five criteria |
| Moderately | `table_per_filing`, ship `append_as_at` only | One landing strategy. Some customers fit badly |
| Badly | Ingest itself. Customer lands files by their own means into Postgres | Honest position: *put the file where it can be governed and we guarantee what happens after*. Loses the workflow, keeps the product |

**Never cut:** the bypass suite, the ephemerality proof, the tenant wrapper tests, evidence append-only, reduction in text content, ING-08, ING-26, **VC-23 post-filter cardinality**, **TOK-27 key backup before first source**, and **CLS-21 the L3 corpus**. Each is a silent failure, and a silently broken product is worse than a late one.

---

## 9. Definition of done, per item

The pull request template.

- Named test IDs pass in CI
- Typecheck passes with strict and `noUncheckedIndexedAccess`
- No `any`, no raw hex, no arbitrary Tailwind value, no direct vendor SDK import in feature code
- New routes declare a permission, startup assertion passes
- New external calls sit behind a port
- Migrations run up and down
- New screens have loading, empty, error and ready states
- New screens pass axe with zero violations, snapshots at three viewports
- No new CSS class was invented. An agent never adds one: if a primitive needs a class that does not exist, it stops and says which. A human may add one to `opintel-master.css` as a reviewed change, and only then does a component use it
- The traceability matrix has no uncovered inventory item
- Where the build diverged from the specification, the specification is updated in the same pull request

---

## 10. What changed from v1.0

| Change | Effect |
|---|---|
| Slice 1 split into 1a and 1b | 1a is shippable and satisfies four of five pilot criteria. 1b adds language |
| Calendar estimates removed | Sequence is the constraint, duration is not forecastable for this kind of work |
| Parquet connector replaced by spreadsheet ingest | Four new items in P2, one new sidecar item, thirty-six new tests, a new screen |
| Landing strategy as a per-source setting | Both implementations. No default. Stamped on every record |
| Demo pack reshaped | Twelve reinsurance spreadsheets in inconsistent formats rather than pre-made tables |
| SpiceDB self-hosted, confirmed | Managed AuthZed remains the SOC 2 trigger, not a Slice 1 decision |
| Tokenization gated on review | A v1.3 construction signed off; immutable vectors gate 4.3 |

---

## 11. Summary

| | |
|---|---|
| Slice 1a items | 56, across five phases |
| Slice 1b items | 19 |
| Sidecar items | 6, parallel from P2 |
| Phases | 8, each ending in a gate |
| Tests | 501 existing, plus 36 for ingest |
| Hand-written, never generated | 6 |
| Added by external review | 3 new work items, 1 sidecar item, 36 new tests |
| Test-first, non-negotiable | 7 |
| Highest risk | Sidecar isolation, then bordereaux reality |
| First gate | End of P0 |

**The plan is dependency-ordered.** Anything reordered should be checked against the dependency column, because most of the sequencing exists for a reason rather than by habit.

**Slice 1a is the product.** It connects sources, lands spreadsheets, governs every field, answers agent queries and records what was released. Slice 1b makes it answer questions in words. The first is what an unattended agent uses. The second is how the system gets configured.


**S2b verification.** The accepted [canonical mapping](review/s2b-mapping.md)
preserves the existing J series. The suite uses the published session interface
and fixture injection, not implementation inspection. It includes positive
controls, a broken-lock mutation control and failing structured-error checks.
J-044/J-045 fail explicitly on the missing authenticated query path; J-055
asserts the expected tracker success documented in A.7. The tests remain red
where later items must close gaps; see [current results](review/s2b-results.md).
No production fix is part of S2b.


**S2e implementation.** `sidecar/execution` mounts staged `/validate` and
`/execute`, with privileged scanner materialisation for clear/aggregate-only
objects and scoped connector treatment/appends for treated objects. It enforces
post-pushdown scan admission, actual staging row bounds, per-pool concurrency and
bounded waiting, cancellation, outer LIMIT/truncation, structured resource
refusals and cleanup before response. Project defaults/bounds are in the shared
execution contract; the authenticated application caller remains 5.7. J-048's
resource-envelope exemption is removed. J-021, J-024 to J-026 and the sidecar
transport portion of J-022/J-023 are exercised here; workspace degraded-state
integration cannot be claimed before 5.7's query transport exists. S4's handwritten
sentinel proof and S5's container security/deployment remain separate items.
Streaming remains deferred. See `docs/review/s2e-progress.md` for verification.


### Item 5.7 — query dispatch and evidence boundary

The application runs the existing refuse-only pre-filter, resolves the current
pool compilation and source relationships, and dispatches its read plan and
entitlements to the pinned mTLS sidecar. The sidecar independently inspects,
binds and executes. Native result types accompany result columns. No cached or
partial answer is served when a source or the sidecar becomes unavailable.

`EvidenceWriterPort` gates execution and release of a structured answer. Tests
use a marked stub; startup rejects that marker outside a test build. Production
now uses item 5.11’s durable writer: a committed header gates source work and a
committed completion gates result release.
I-009's model-readable reduction remains solely 5.8; 5.7 emits structured
content and an evidence id, with no successful-answer text composition.

J-044/J-045 now exercise real pool keys, relationships, MCP sessions and SQL
execution, including revoked and expired keys on the next request. Their two
prerequisite exemptions are removed. The bypass project consequently requires
the same local service prerequisites as the functional project.


### Item 5.9 — explain dry run

`explain` uses query's shared preparation and refusal formatter, then the
sidecar's existing authoritative `/validate`. It reports exposed planned reads
and reductions, explicitly states nothing was read, and keeps data-dependent
checks pending. It remains callable with query mode disabled and needs no
execution evidence writer. N-003 covers real MCP/mTLS validation, refusal parity
and zero source connections. No sidecar enforcement or other item is changed.
See [verification results](review/5-9-implementation.md).

### Item 5.10 — evidence domain and schema

Evidence has an immutable request header and one append-only completion. A
header without completion reads as incomplete. Element state is explicit;
treatment is null if and only if state is withheld or undecided. Migration 046
enforces these structures, captures version stamps, partitions by UTC start
month, and grants the application only SELECT and INSERT on evidence parents
and partitions. Domain snapshots and boundary schemas preserve the recorded
facts. The record writer remains item 5.11.
See [verification results](review/5-10-implementation.md).


### Item 5.11 — durable record writer

Production query dispatch now uses the evidence writer. Source-free preparation
captures the plan, versions and source provenance before the header commits.
Completion atomically appends per-element deliveries, reductions, stage reasons,
freshness, landing strategy and derived synthetic provenance before rows return.
Selected and actually used token-key versions are distinct: the former is pinned
at open, the latter reported by the sidecar, with equality enforced in the database.
Migration 047 adds transaction-coalesced catalogue generation and the selected/used
constraints. The test-stub startup assertion remains.
See [verification results](review/5-11-implementation.md).

Type-mapping visibility follow-up (3.2 / introspection and Data sources screens):
unsupported findings are persisted separately in the introspection diff, with
`explicitly_excluded` versus `unmapped`; Data sources counts unsupported separately
from undecided; unmapped findings appear in the existing read-only Observations
screen. See §4.4 and `docs/review/unsupported-type-visibility.md`. This does not add
a general observations workflow.

**5.20 custody decision.** One verified engine is designated per project. Custody requests route there. Assignment of a tokenized source to another engine requires its current primary key version and derived sentinel to match the recorded project key. Rotation immediately makes stale engines unavailable for tokenized execution. Distribution remains customer-owned provisioning pending 5.21. Clear-only execution does not require a key match. Cross-engine queries refuse with `sources_cannot_be_joined`; this item implements routing, not distributed execution.

**5.20 configuration.** `APPLICATION_TLS_CONFIG` names a strict application identity/trust file containing only `caFile`, `certFile`, `keyFile`. Addresses, pins, engine contract/health, source assignments and custody designation live in the registry. `SIDECAR_CLIENT_CONFIG`, `LANDING_RECEIPT_CLIENT_CONFIG`, and client.json are no longer read. Receipt listener bind host/port remain environment configuration. Development operator tools explicitly register their supplied service deployment; isolated transport fixtures read their explicit service deployment, not an application routing fallback.

**A — Timestamp presentation: absolute plus relative time.** Extends 5.16's
personal date/time preferences using §5.5's reviewed elapsed-age boundaries,
actual-zone labels, cached formatters and one shared 60-second clock with
visibility refresh. Existing `.when`, `.rwhen` and `.audw` styles only.
Focused verification covers boundary/future wording, Toronto EST/EDT and UTC,
preference changes, shared-clock cleanup and visibility refresh.
Visual fixtures tagged `@visual` share a fixed `2026-10-06T15:43:00Z`
clock before navigation, including additional pages in the same context.
Only Date is fixed; polling and rendering timers continue running. This keeps
relative ages reproducible when committed snapshots are compared on later days.

**5.29 structural rebuild (2026-10-07, pending reader review).** `docs/Entitlements.html` replaces the adjusted screen as the layout specification. The reviewed targets are a 1500px page with 20px 26px 40px padding; a 1fr/340px title band with 22px gap, stacked below 1180px; a compact distribution no taller than 150px; one desktop toolbar with 36px controls, ordered decision tabs, grouping, Pool, Source, name filter. Below 820px available width controls wrap; at 390px the tabs occupy their own line. Group rows are 42px with 13.5px/650 labels and inline 12px counts/mixed state; member rows are 38px with 13.5px/560 labels, 11.5px exposed types and 17px named treatment marks. Narrow members retain the reviewed 76px two-line catalogue form: name first, exposed type/mark/Declarations second. Declarations appears on hover, selection, keyboard focus and touch. By table retains bounded tree paging and selection, removes its extra branch filters, and shares the new typography and row geometry. The H-016 geometry expectation follows the reviewed 38px members and 42px branches; its responsiveness threshold, volume, selection and DOM bound are unchanged. View DDL, its UI query and toggle state are removed from this screen; the compiler and permissioned backend endpoint remain. No visual project or baseline regeneration during this review.

**5.29 rebuild measurements (2026-10-07).** Installed Chrome functional checks measured group/member labels at 13.5px with weights 650/560 at 390, 900, 1280 and 1440px. At 1280/1440, group/member rows measure 42px/38px, toolbar 36px, filter 190px and distribution 103px. At 390, the distribution is 121px, tabs occupy their own toolbar line, and members are 76px. Mixed-group summaries wrap as needed at narrow widths so their counts and mixed state remain available before expansion. The 20 focused checks pass, including axe and partial control/mark conformance (2/53 routes, zero findings). The Linux container attempt stopped at browser launch, before any test: Chromium launch timed out. Native bundled Chromium installation is unsupported on this macOS 13 host, so the functional checks used installed Chrome via a temporary configuration outside the repository. No visual project or baseline regeneration; reader review is pending.

**5.29 toolbar reader correction.** Pool and Source use `field-sizing: content` where supported, capped at 200px, with a 170px fixed-width fallback. A decorative, pointer-transparent SVG replaces the browser-controlled arrow; native select interaction remains. Its right edge is 10px inside the picker border, matching the select's 10px left padding. Inline Pool/Source label padding is reduced to 5px. At 1440px, “Development Demo” measures 161.563px with 120px available for its 119.562px text; “All bound sources” measures 151.625px with 110px available for its 109.621px text. Both fit completely. DOM measurements verify equal 10px insets; diagnostic pixels independently show approximately 10px clearance at the right. The earlier 34px measurement described the text-to-arrow gap and did not establish symmetry. At 1280px, retaining all segments and the 190px filter on one line compresses the Pool select to 121.188px, leaving only 79px for its 119.562px text. The newly added full-label assertion fails honestly there; the 390px and 1440px focused checks pass, including axe and partial conformance. Resolving this requires a reviewed intermediate-width sacrifice (filter width or earlier wrapping); it is not fixed by raising the select cap. No visual project or baseline regeneration.

**Treatment legend (5.29 reader review).** The existing Decision distribution legend replaces its swatches with the six shared treatment marks at 17px, matching Entitlements rows. Counts and labels remain, with no additional legend section. Marks use the existing darker treatment colour tokens; the distribution bar retains its original colours. Undecided retains the yellow background and ink dashed outline. Group/member/tree marks have accessible names independently of the legend; shared treatment badges and the catalogue’s Undecided mark also expose their names at every width. Dashboard already has all six labelled marks. Activity evidence and introspection pair every treatment mark with explanatory text. The schema explorer has no separate legend and currently shows only the Undecided mark (text at wide widths; an accessible name when the narrow label is hidden). The current Suggestions implementation has no treatment marks; its structural design specifies them, but that consumer has not landed. Two focused browser checks pass at 390/1440, including all six legend names and sizes, the 150px panel ceiling, member accessibility, axe and partial control/placement conformance. No visual project or baseline regeneration.

**Treatment matching and focus correction.** Row and legend treatment marks now share one default colour mapping in the shared Mark component: green-dk, mask-dk, agg-dk, token-dk, held-dk; Undecided retains its yellow fill and ink-2 outline. Contrast against surface / surface-2 is respectively 8.62/8.03, 7.18/6.69, 12.45/11.60, 10.64/9.91, 10.72/9.99 and 8.00/7.45 to one. Every meaning-bearing stroke/fill exceeds 3:1; the yellow fill is not the distinguishing boundary. Entitlements legend entry gaps are 7px and internal gaps 4px; focused rendered checks measure two lines at 1440px and three at 390px. Segmented buttons use the existing 2px green focus language, inset by 2px to remain visible inside the clipped segment container. Colour matching, focus, accessible names, axe and partial placement/control conformance pass in the two focused checks. Touch-name disclosure is not implemented: the existing account popover is fixed to the drawer and the project menu is sized for project switching, not a small anchored name popup. Reusing their surface styling requires a reviewed anchored variant and an appropriately sized trigger; next-tap dismissal itself is ordinary UI state/event handling. No new class, visual project or baseline regeneration.

**Treatment names on touch (5.29 reader decision).** Entitlements group and member indicators, including By table, show the treatment name beside the 17px mark at viewport widths of 600px and above. Below 600px, the existing toolchip is a 44px-square trigger and opens the approved `pop[data-purpose="treatment-name"]` variant beside the mark, bounded to an 8px viewport inset. Any following outside tap, a repeated tap on the trigger, or Escape dismisses it; Escape returns focus. Scrolling/resizing also closes it, avoiding a stale anchor. UI state is in a local Zustand store. Only one mark is rendered per indicator at either width, retaining the placement contract. Narrow member rows remain 76px: vertical padding is 4px rather than 8px to accommodate the 44px target without overlapping the name or Declarations. Browser measurements verify 44x44 targets at 390px and 599px in grouped and tree layouts, visible Aggregate only text at 600px, bounds and dismissal. All 25 affected non-picker functional checks pass, including axe and partial control/placement conformance (2/53 routes, zero findings). The three picker checks are outside this change; the previously recorded 1280px full-label failure remains unresolved pending its separate layout decision. No full gate, visual project, baseline regeneration or completed-item commit is claimed.

**Dark action-bar controls (5.29 reader decision).** The approved weighted-bar variant gives Treatment, Mask kind and Justification a plum-2 background, rule-2 border and surface text; inline picker labels use surface-3 on transparent backgrounds. Closed selects retain native interaction but use the same shared decorative PickerChevron as the toolbar, with a measured 10px inset from the inner right border and 10px left text padding. Both selectors measure this inset at 390/1440; diagnostic raster captures independently corroborate the approximately 10px clearance, with pixel rounding/antialiasing at glyph edges. Native options retain surface/ink colours. Justification placeholder styling explicitly uses surface-3 at opacity 1, yielding 13.55:1 against plum-2; typed surface text yields 16.31:1. The previous ink-3 would be 2.52:1. The production field has no placeholder copy; tests insert temporary text to exercise the pseudo-element, without inventing production copy. Four focused checks pass, covering both viewport widths, clear justification enforcement, mask selection, atomic bulk behaviour, axe and partial conformance (1/53 routes, zero findings). No visual project or baseline regeneration.

**5.30 review candidate.** Rebuilt Suggestions against `docs/Suggestions.html`,
with the approved scoped master additions, structured current columns and
per-pool treatments/domain provenance, exact pool/element decision navigation,
contextual lookup, and seven UTC calendar-day query/explain trends. The band
labels the interval once as “Last 7 days (UTC)”; §5.5 records why counts are UTC
while absolute timestamps follow display preferences. Page geometry uses the
existing `.body:has(> .screen[…])` host pattern so padding is not doubled.
Domain confirmation, complete membership review, history and Activity SQL
visibility remain authoritative. User design review and approved baselines are
pending; no visual project or baseline regeneration during this iteration.


**5.31 review candidate (2026-10-07).** Observations is rebuilt against
`docs/Observations.html` with the approved scoped master rules and Open/Resolved
tabs, default Open. Cause groups share one explanation/resolver and retain
member/history rows; uniform member lists carry no kind marks. The prior filing
feed retained only the latest arrival notice, so a successful retry erased the
quarantine from view. Forward migration 066 adds immutable trigger-written safe
lifecycle metadata; a recorded landing resolves a filing, never an acknowledge,
pending retry, duplicate or changed cause. Accepted receipts also resolve before
the arrival projection catches up. Mapping/source and custody resolution facts
are retained, with custody reads still administrator-only. Overwritten pre-migration
facts cannot be reconstructed; they remain an explicit coverage limit.

Prepare for the operator is one copy/download packet path for a filing, cause or
current filing groups, with complete cursor membership, full filing/zone IDs,
Engine ownership captured at arrival and operator-local next steps. No file
contents, filename, local reason, delivery or recipient directory. Failed or
changed membership preparation produces no partial packet. Rendered dimensions
and focused validation are recorded in `docs/review/5.31-observations.md`.
Reader approval remains pending; no visual project, baseline update, full gate
or completed-item commit is claimed.
