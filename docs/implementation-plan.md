# Opintel Slice 1: Implementation and Validation Plan

**Version 2.0.** Pairs with Slice 1 technical documentation v1.1, algorithm specifications v1.2, test specification, master stylesheet.

Supersedes v1.0. Six decisions are now settled and applied: Slice 1 splits into 1a and 1b, calendar estimates are removed, SpiceDB is self-hosted, spreadsheet ingest replaces Parquet as the second connector, tokenization is reviewed by the founder before dependent code, and the demo pack is reshaped around reinsurance spreadsheets.

---

## 0. Ground rules

**A task is done when its tests pass in CI**, not when the code looks right. Every item names the test IDs that prove it.

**No item starts before its dependencies are green.** The order below is a dependency order. It is the only ordering constraint that matters, and it is the reason this plan carries no calendar estimates: sequence is knowable, duration is not.

**Four items are hand-written, never generated.** The tenant wrapper (1.4), the DuckDB two-session construction (S2), the ephemerality proof (S4), and the bypass suite (C.6). A generator produces plausible wrong answers in exactly these places, and a wrong bypass suite passes while proving nothing.

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
| 1.9 | OIDC with PKCE, account linking on verified email | 1.7 | provider adapters | C-001 to C-011 |
| 1.10 | `/auth/providers` route resolution | 1.7, 1.9 | endpoint | A-001 to A-013 |
| 1.11 | **Design system from the master stylesheet**, ported to its class contract | 1.1 | `shared/ui` | O-001 to O-011 |
| 1.12 | App shell: router, drawer, top bar, error boundaries, toast host | 1.11 | `app/`, shell | shell renders |
| 1.12a | Frontend HTTP client: typed fetch against the API, error envelope to AppError, request id surfaced | 1.5a, 1.11 | src/shared/api | envelope parsed, network failure becomes AppError, request id available to the UI |
| 1.13 | Auth screens | 1.10, 1.11 | four screens | A-014, A-015, B-007 to B-009 |
1.13a | Authenticated route guard: unauthenticated visitors redirect to /sign-in, the intended path is preserved and restored after sign-in | 1.12, 1.13 | app/guard.tsx | an unauthenticated visit to a console route redirects, the path is restored |
| 1.14 | Kitchen sink, visual snapshots, axe in CI | 1.11 | `/dev/kitchen-sink` | O-005 to O-009 |
| 1.15 | Observability: OTel, request id, logs with field allowlist | 1.1 | `platform/telemetry` | no customer data in telemetry |

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
| 3.12 | Data sources screen, connect wizard, origin badges, demo card; safe persisted failure messages and failed-source retry | 3.6, 1.11 | screens | F-001, F-004, F-007, O-002 |
| 3.13 | Filings within source detail, expandable per source. Quarantine surfaced on the dashboard and in observations | 3.10, 1.11 | source screen sections | ING-27, ING-28, ING-29, ING-31, ING-32 (ING-30 remains with 4.1) |
| 3.14 | Schema explorer, virtualised, prefix fetch; scoped catalogue endpoint and immutable source aliases | 3.1, 1.11 | screen | G-019, G-020, R-001, R-002 |
| 3.15 | Introspection run and diff screen, live progress through SSE in 3.16 | 3.6 (3.16 upgrades progress transport) | screen | G-003 to G-009 |
| 3.16 | SSE hub, Redis fan-out, snapshot then deltas | 1.2, 1.12 | `platform/sse` | S-008 to S-011 |

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
| 4.5 | Aggregate-only and tokenized-operation query inspection. **Post-filter cardinality, two stages** | 4.4 | `entitlements/aggregate.ts` | VC-10 to VC-14, VC-23 to VC-30, H-008 (query inspection enforcement) |
| 4.5a | Identifier resolver returning `object_unavailable`, distinguishing withheld from undecided from absent | 4.4 | `entitlements/resolve.ts` | VC-19 to VC-22 |
| 4.6 | Pattern rules, applied at diff time, provenance recorded | 4.1, 3.6 | `entitlements/rules.ts` | H-013, H-014, R-004 to R-007 |
| 4.7 | Bulk set with justification on clear | 4.1 | endpoint | H-010 to H-012, H-009 (API rejection) |
| 4.8 | Entitlements screen: virtualised tree, select, bulk bar, chips | 4.1, 1.11 | screen | H-016, H-018, H-009 (UI offers no reset) |
| 4.9 | Policy version bump and cache invalidation | 4.4 | `entitlements/version.ts` | M-005, M-006 (session cache assertions VC-17/VC-18 belong to S2), H-002 (recompilation timing) |

**Gate.** A newly landed spreadsheet column is undecided and unreadable. Setting a treatment recompiles in under two seconds. Withheld and undecided both absent from the DDL and distinguishable in metadata. The same filing party identifier tokenizes identically across two sources. Bulk-to-clear without justification returns 400.

### P4 Access

| # | Item | Depends | Creates | Proves |
|---|---|---|---|---|
| 5.2 | Key generation, hashing, shown once, rotation and revocation | 5.1 | `pools/keys.ts` | I-001 (generation and shown once), I-002 (hashing), I-003 (route check), I-015 to I-017 |
| 5.3 | Pool to source binding in SpiceDB, two-check resolution | 5.1, 2.2 | `pools/binding.ts` | I-005, I-006 |
| 5.4 | Agent presence state machine, never silently removed | 5.1, 3.16 | `pools/presence.ts` | I-018 to I-021 |
| 5.5 | MCP server, key auth, tool listing driven by pool config | 5.2, 4.4 | `modules/mcp` | I-004, I-013, I-014, I-023 |
| 5.6 | `describe`: entitled with types, withheld marked, undecided absent | 5.5, 4.4 | tool | I-007, I-008 |
| 5.7 | `query`: SQL subset on the parsed statement, dispatch to sidecar | 5.5, S2 | tool | I-009 to I-012, K-001 to K-009, F-010 (query refusal) |
| 5.8 | **Reduction in the text content the model reads.** Hand-reviewed | 5.7 | `mcp/response.ts` | I-009 |
| 5.9 | `explain` dry run, no source contact | 5.7 | tool | N-003 |
| 5.10 | Evidence domain, append-only grants, partitioning | 2.1 | `modules/evidence` | M-001 to M-006 |
| 5.11 | Record writer: per-element treatment, versions, freshness, landing strategy, synthetic derived | 5.10, 5.7, 3.9 | `evidence/write.ts` | M-002, M-011, M-012; ING-24 persisted landing-strategy evidence; TOK-30 persisted token-key version |
| 5.12 | Activity screen, filters, record detail | 5.10, 1.11 | two screens | M-007, M-013 to M-015 |
| 5.13 | Export: streaming NDJSON and CSV, synthetic excluded | 5.10 | endpoint | M-008 to M-010 |
| 5.14 | Pools screens: list, detail with key management, agent twin | 5.2, 5.4 | three screens | I-001 (copy-to-dismiss UI), I-015 to I-022 |
| 5.15 | Dashboard: ratio, spectrum, tiles, feed, pool shields, empty when clean | 4.9, 5.4 | screen | O-001 to O-004 |
| 5.16 | Settings: project and personal pages | all above | screens | Q-001 to Q-038 |
| 5.17 | Retention and redaction jobs | 5.10 | jobs | Q-025 to Q-027 |

**Gate, and this is the Slice 1a gate.** An external agent configured from published documentation only lists its tools, runs `SELECT *` on a table with a withheld column, receives the other columns and is told in text which were withheld. A withheld column returns `element_withheld`, an undecided one `entitlement_missing`, a non-existent one an ordinary error. Key rotation keeps a twenty-agent pool serving with zero failures. Every request produced exactly one immutable record. Pilot criteria S1 through S4 pass.

**Slice 1a is shippable here.** It can be sold, piloted and audited without anything below.

---

## 3. Slice 1b work items

Everything here is natural language. Nothing above depends on anything below, which is what makes 1a shippable on its own.

### P6 Language

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
| 6.11 | QQC L1, L2, L3, rewrite once | 6.10, S3 | `querying/qqc.ts` | CLS-14 to CLS-16, L-017 to L-019 |
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
| S2 | **Two-session construction**, hardening with `lock_configuration` last, `/validate`, `/execute`. **Hand-written** | S1, 4.4 | session lifecycle | J-003 to J-018, VC-17/VC-18 (session compilation cache, with 4.9), and the bypass suite against both execution paths |
| S3 | Cardinality estimation, cancellation, concurrency governance | S2 | | J-021, J-025, CLS-15 |
| **S2b** | **Streaming execution path**, condition evaluated conservatively, bypass suite run against it | S2 | `sidecar/stream.ts` | bypass cases 11 to 14 |
| S4 | **Ephemerality proof**, sentinel scan of disk and mapped memory. **Hand-written** | S2 | test harness | J-019, J-020, TOK-38 (with S2 staging) |
| S5 | VNet mode, OCI image, egress restricted to declared hosts | S2 | packaging | SD-005 subset |

**The sidecar is the critical path and the highest technical risk.** S1b is new in v2.0 and it is the right home for landing: the sidecar already runs inside the customer's environment, already holds credentials they control, and already sends nothing out. Putting ingest anywhere else would break the claim that files never leave their network.

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
