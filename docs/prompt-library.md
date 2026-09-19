# Opintel: Codex prompt library

One prompt per work item, in dependency order. Each names the sections to read so no prompt needs the whole specification in context.

**Rules for using this.** One item per prompt. Review the diff before the next one. Never start an item whose dependencies are not green. Six items are marked **DO NOT DELEGATE** and must be written by hand: 1.4 tenant wrapper, 4.3 tokenization, 4.4 view compiler, S2 DuckDB session, S4 ephemerality proof, C.6 bypass suite.

---

## 0. Repository layout

Before the first prompt:

```
opintel/
├── AGENTS.md
├── docs/
│   ├── implementation-plan.md
│   ├── slice1-technical-documentation.md
│   ├── algorithm-specifications.md
│   ├── test-specification.md
│   └── opintel-master.css
└── reference/
    └── console.html
```

`git init` first. Every agent change should be a reviewable diff.

---

## 1. First prompt: audit, no code

Run this before anything else. It is a free review of the specifications by the reader who will use them.

```
Read every file in docs/ in full, and AGENTS.md. Do not write any code.

Produce docs/review/readiness.md containing:

1. Contradictions. Anywhere two documents disagree, quoting both.
2. Decisions you would have to make yourself to implement items 1.1
   through 1.15. Name the file, the function, and the decision.
3. Anything referenced but never defined.
4. Your understanding of item 1.4, the tenant wrapper, in five
   sentences. The intent, not the code. Explain specifically why
   set_config's third argument matters.
5. Your understanding of why "undecided" is the absence of a row
   rather than a treatment value, in three sentences.

List, do not resolve. Do not propose fixes.
```

**Read the answer before continuing.** Items 4 and 5 are the real test. If it cannot restate those in its own words, the specification has a gap that more prose will not close.

---

## 2. Prompt template

Every item below follows this shape:

```
Implement item <N> from docs/implementation-plan.md.

Read: <sections>
Tests: <ids>

<any constraint specific to this item>

Done when the named tests pass. Do not implement anything from
another item.
```

The last line matters. Without it an agent will helpfully build the next three items too.

---

## 3. P0 Foundation

### 1.1 Repo skeleton
```
Implement item 1.1.
Read: technical documentation §1.1 bounded contexts, §5.1 frontend tree,
§9.1 pipeline stages 1 to 3.
Create only: the src tree, tsconfig with strict and noUncheckedIndexedAccess,
eslint with the module boundary rule and rules blocking `any`, raw hex and
arbitrary Tailwind values, dependency-cruiser config, and CI stages 1 to 3.
No application code. Modules are empty folders with an index.ts.
Done when typecheck, lint and an empty test run pass in CI.
```

### 1.2 Infrastructure and migrations
```
Implement item 1.2.
Read: technical documentation §4.1 conventions, §9.3 migrations.
Create Docker Compose with Postgres 16 including pgvector, Redis, and
self-hosted SpiceDB. Create the migration runner with up and down.
Migration 001 creates nothing yet; it proves the runner.
Done when migrations run both directions in CI against a fresh database.
```

### 1.3 Shared kernel
```
Implement item 1.3.
Read: technical documentation §1.3 value objects, §1.7 types, §6.2 Result.
Create Result, DomainError, the branded id factories, a clock port and an
id factory. Branded ids must make (projectId, poolId) uncallable with the
arguments swapped; prove that with a type-level test.
Done when every Result branch is covered.
```

### 1.4 Tenant wrapper: DO NOT DELEGATE
Hand-written. The agent may be asked to review it afterwards:
```
Read platform/db/scope.ts and algorithm specifications section D.
Do not modify it. Report any way a connection could return to the pool
carrying app.project_id, or any path that reaches the pool directly.
```

### 1.5 Mail port
```
Implement item 1.5.
Read: technical documentation §1.1 bounded contexts and §6.5 boundaries, the outbox rule.
Create MailPort, a local file adapter that logs the URL, and the outbox so
mail is sent only after commit.
Done when a rolled-back transaction sends no mail.
```

### 1.6 Identity domain and schema
```
Implement item 1.6.
Read: technical documentation §4.2 identity and tenancy, §1.2 aggregates.
Create the identity module domain and the migration for user_account,
user_identity, magic_link_token, user_session.
Done when the domain invariants are covered.
```

### 1.7 Magic link
```
Implement item 1.7.
Read: technical documentation §3.2 and §3.3, §4.2 magic_link_token,
§2.5 identity endpoints.
Tests: B-001 to B-015, A-005, A-006.
Token consumption must be atomic in one statement. The response to
request-link must be identical in shape and timing whether or not the
address is known.
Done when those tests pass.
```

### 1.8 Sessions
```
Implement item 1.8.
Read: technical documentation §3.3 session.
Tests: D-001 to D-011.
Opaque id in the cookie. No JWT, no claims. Server state in Redis.
```

### 1.9 OIDC
```
Implement item 1.9.
Read: technical documentation §3.2 federated identity.
Tests: C-001 to C-011.
The verified email is the identity. An unverified email claim is refused
and never links.
```

### 1.10 Provider route resolution
```
Implement item 1.10.
Read: technical documentation §3.1 and §3.2.
Tests: A-001 to A-013.
No account enumeration. The only observable difference is an IdP redirect.
```

### 1.11 Design system
```
Implement item 1.11.
Read: technical documentation §5.7, docs/opintel-master.css in full, and
reference/console.html for markup patterns.
Tests: O-001 to O-011.
Import opintel-master.css unchanged. Build React primitives against its
existing class names. Do not invent a class. Do not restyle anything.
If a primitive needs a class that does not exist, stop and say which.
```

### 1.12 App shell
```
Implement item 1.12.
Read: technical documentation §5.1 structure and §5.5 screen contract, reference/console.html for the
drawer, groups and top bar.
Router, five nav groups, top bar with breadcrumb, error boundary per route,
toast host. Nav items render but are not yet permission-gated.
```

### 1.13 Auth screens
```
Implement item 1.13.
Read: technical documentation §3.1, §5.5, reference/console.html.
Tests: A-014, A-015, B-007 to B-009.
One sign-in screen showing the email field and every enabled provider.
```

### 1.14 Kitchen sink
```
Implement item 1.14.
Read: technical documentation §5.7 design system and §7.1 testing levels.
Tests: O-005 to O-009.
Create /dev/kitchen-sink rendering every primitive in every variant and
state. Wire visual snapshots at 390, 900 and 1440, and axe, into CI.
```

### 1.15 Observability
```
Implement item 1.15.
Read: technical documentation §8.2 traces, §8.3 metrics, §8.4 logs.
OTel tracing, request id on every log line, structured logs with a field
allowlist enforced by the logger.
Done when a test proves a row value cannot be logged.
```

---

## 4. P1 Tenancy

```
2.1  Read: technical documentation §1.2 Project aggregate, §4.2 tables.
     Region is immutable: no setter, no route.

2.2  Read: technical documentation §3.4 the authorization graph. Tests: E-001 to E-004.
     Agents do not appear in the graph.

2.3  Read: technical documentation §3.5 route declarations.
     A route without a permission must fail server startup, not review.

2.4  Read: technical documentation §4.7 row-level security. Tests: RLS-10.
     Scan pg_policies and fail if any tenant table lacks a policy.

2.5  Read: technical documentation §1.2 Industry and §4.3 industry and vocabulary.
     Tests: E2-005, E2-011. Inheritance is by reference. Nothing is copied.

2.6  Read: technical documentation §1.2 Project aggregate and §2.5 tenancy endpoints.
     Tests: E2-001 to E2-022.

2.7  Read: technical documentation §2.5 tenancy endpoints and §3.2 sign-in. Tests: E-010 to E-014.
     The relationship is written on acceptance, never on send.

2.8  Read: technical documentation §3.4 roles. Tests: E-005 to E-009.
     Operator keeps agents running without widening what they see.

2.9  Read: reference/console.html Access screen. Tests: E-009, E-015, E-016.

2.10 Read: technical documentation §1.2 Project invariants.
     Tests: E2-023 to E2-035.
     Entitlements must be untouched. Assert row by row.
```

---

## 5. P2 Data and ingest

```
3.1  Read: technical documentation §1.2 CatalogElement and §4.3b sources and catalog.
     Tests: G-006, G-007, G-012.
     duckdb_name is assigned once and never recomputed.

3.2  Read: technical documentation §4.4 the exposed namespace and type mapping.
     Tests: G-010 to G-013, R-003.

3.3  Read: technical documentation §2.7 the sidecar contract, and algorithm specifications C.1. Tests: F-001 to F-010.
     All source contact goes through the sidecar, including introspection.

3.4  Read: technical documentation §4.3b sources and catalog, and algorithm specifications C.4. Tests: G-001 to G-005,
     G-014 to G-016.

3.5  Read: technical documentation §10.5 secrets. Tests: F-005, F-006.
     A literal secret must fail the check constraint.

3.6  Read: technical documentation §1.5 state machines.
     Tests: G-017, G-018, R-023.

3.7  Read: implementation plan P2 ingest, algorithm specifications A.3.1.
     Tests: ING-01 to ING-08.
     A file that cannot be attributed is quarantined. Never guessed.

3.8  Read: implementation plan P2 ingest. Tests: ING-09 to ING-18.
     A malformed file fails alone. The batch continues.

3.9  Read: implementation plan P2 landing strategy. Tests: ING-19 to ING-26.
     No default. A connection without a strategy is refused.

3.10 Read: implementation plan P2 filing register. Tests: ING-27 to ING-32.

3.11 Read: technical documentation §1.2 demo sources.
     The demo path must call the same connector port. Assert by spying on
     the port, not by comparing output.

3.12 Read: reference/console.html Data sources screen.
     Tests: F-001 to F-004, O-002.

3.13 Read: reference/console.html Data sources, the expandable source rows.
     Tests: ING-27 to ING-32.
     Filings live inside the source. Quarantine surfaces on the dashboard
     and in observations.

3.14 Read: reference/console.html schema explorer.
     Tests: G-019, G-020, R-001, R-002.

3.15 Read: reference/console.html introspection run. Tests: G-003 to G-009.

3.16 Read: technical documentation §5.4 SSE into the cache. Tests: S-008 to S-011.
```

---

## 6. P3 Governance

```
4.1  Read: technical documentation §1.2 Entitlement, §4.5 schema.
     Tests: H-001, H-004, H-009.
     There is no 'undecided' value and no route back to it.

4.2  Read: technical documentation §1.2 Entitlement and algorithm specifications B. Tests: H-002 to H-008.

4.3  DO NOT DELEGATE. Hand-written, and blocked until the construction is
     signed off. Afterwards the agent may review it:
     "Read entitlements/token.ts and algorithm specifications section A.
      Do not modify it. Report any path where a token could differ for the
      same input, or where the key could reach a log, a span or Postgres."

4.3a Read: algorithm specifications A.5.1. Tests: TOK-27 to TOK-30.
     A project with no verified backup cannot connect a source.

4.3b Read: algorithm specifications A.3.1. Tests: TOK-19 to TOK-22.
     A naive timestamp with no declared zone is refused, never cast using
     the host timezone.

4.3c Read: algorithm specifications A.3.2. Tests: TOK-23 to TOK-26.
     Canonicalisers are pure, versioned and per element. Reject registration
     of one that does I/O or reads the clock.

4.4  DO NOT DELEGATE. Hand-written. Afterwards:
     "Read entitlements/compile.ts and algorithm specifications section B.
      Do not modify it. Report any input where an undecided or withheld
      element could appear in the emitted DDL."

4.5  Read: algorithm specifications B.4. Tests: VC-10 to VC-14,
     VC-23 to VC-28.
     The check is on post-filter cardinality, in two stages. A group
     definition passing is not sufficient.

4.5a Read: algorithm specifications B.2. Tests: VC-19 to VC-22.
     Distinguish withheld, undecided and absent. No dummy column.

4.6  Read: technical documentation §4.5 entitlements and pools.
     Tests: H-013, H-014, R-004 to R-007.

4.7  Read: technical documentation §2.5 entitlements endpoints. Tests: H-010 to H-012.

4.8  Read: reference/console.html Entitlements screen.
     Tests: H-016, H-018.

4.9  Read: algorithm specifications B.5. Tests: VC-17, VC-18, M-005, M-006.
```

---

## 7. P4 Access

```
5.1  Read: technical documentation §1.2 Pool. Tests: I-001 to I-003.
     At most one current key. Agents are not members of this aggregate.

5.2  Read: technical documentation §3.7 agent authentication. Tests: I-015 to I-017, I-002.
     Shown once, hashed at rest, no route returns it afterwards.

5.3  Read: technical documentation §3.4 pool binding. Tests: I-005, I-006.
     Two checks, pool pinned by the key.

5.4  Read: technical documentation §1.5 state machines, agent presence. Tests: I-018 to I-021.
     A disconnected agent is never removed from the list.

5.5  Read: technical documentation §2.6 the agent interface.
     Tests: I-004, I-013, I-014, I-023.

5.6  Read: technical documentation §2.6 the agent interface, describe. Tests: I-007, I-008.
     Withheld elements are listed and marked. Undecided are absent.

5.7  Read: algorithm specifications C.3, technical documentation §2.7 the sidecar contract.
     Tests: I-009 to I-012, K-001 to K-009.
     Check the parsed statement, never the raw text.

5.8  Read: technical documentation §2.6 the response contract.
     Tests: I-009.
     The reduction must appear in the text content the model reads, not
     only in structured fields. This is the single most important detail
     in the interface. Hand-review required.

5.9  Tests: N-003. Dry run makes no source contact.

5.10 Read: technical documentation §4.6 evidence and §10.1 what we are defending. Tests: M-001 to M-006.
     Append-only is enforced by grant. Assert the grant, do not try and catch.

5.11 Read: technical documentation §4.6 evidence.
     Tests: M-002, M-011, M-012.
     Versions are captured at request start, not completion.

5.12 Read: reference/console.html Activity. Tests: M-007, M-013 to M-015.

5.13 Read: technical documentation §2.5 querying and evidence endpoints. Tests: M-008 to M-010.

5.14 Read: reference/console.html Pools. Tests: I-015 to I-022.

5.15 Read: reference/console.html Dashboard. Tests: O-001 to O-004.
     Empty when clean.

5.16 Read: technical documentation §5.6 screens and §1.7 ProjectSettings.
     Tests: Q-001 to Q-038.

5.17 Read: technical documentation §1.7 ProjectSettings, evidence retention. Tests: Q-025 to Q-027.
```

**After 5.17, Slice 1a is complete.** Run the gate before starting 1b.

---

## 8. Slice 1b Language

Start only after the Slice 1a gate passes. Nothing in 1a depends on anything here.

```
6.1  Read: technical documentation §11.1 two tiers, two owners, §1.2 VocabularyTerm.
     Tests: R-021, E2-028.
     Four kinds, not one entity. A project term shadows an industry term
     of the same name; both rows continue to exist.

6.2  Read: technical documentation §1.2 EffectiveVocabulary. Tests: R-021.
     The merge is server side. Screens and the classifier consume the
     merged result with a source field per term.

6.3  Read: technical documentation §4.3 the retrieval layer. Tests: T-001 to T-027.
     One embedding table with partial HNSW indexes per owner type, not a
     vector column on each owning table.

6.4  Read: technical documentation §4.3 the retrieval layer, model versioning. Tests: T-011 to T-019.
     A model change is a backfill, not a migration. New rows alongside old,
     active model flipped per industry only when its backfill completes.

6.5  Read: technical documentation §1.7 types and §6.5 boundaries, plus algorithm specifications E.2. Tests: CLS-01.
     Model pinned centrally. Prompts versioned and stored, never inlined
     in code. Temperature fixed per call site.

6.6  Read: algorithm specifications E.2. Tests: CLS-01 to CLS-04.
     A malformed CIL is a refusal, never a repair. Do not retry with
     "that was not valid JSON": it breaks determinism.

6.7  Read: algorithm specifications E.3. Tests: CLS-05 to CLS-07,
     T-001 to T-008.
     Thresholds are configuration. Boundaries are strict: exactly 0.85
     does not auto-resolve.

6.8  Read: algorithm specifications E.4 and E.4.1.
     Tests: CLS-08, CLS-09, CLS-18 to CLS-20, L-006, L-007.
     Two lookups: categorical value map first, then string distance for
     typos only. Every candidate carries its provenance.

6.9  Read: algorithm specifications E.5. Tests: CLS-11, CLS-12,
     L-014 to L-016.
     Two join paths of equal standing refuse and name both. Never pick.

6.10 Read: technical documentation §1.2 Industry, grain rules. Tests: CLS-13, L-013.
     A measure with no grain rule refuses composition. A warning on a
     wrong number is not a fix.

6.11 Read: algorithm specifications E.6. Tests: CLS-14 to CLS-16,
     L-017 to L-019.
     L1 structural, L2 cardinality, L3 semantic. A rewrite returns to
     composition once; a second rewrite refuses.

6.11a Read: algorithm specifications E.6.2 and E.6.3.
     Tests: CLS-21 to CLS-26.
     Build the L3 adversarial corpus. It gates CI and any model pin change.
     100% of known-bad cases caught; one miss fails the build. At least 95%
     of known-good approved, because a validator that refuses everything
     gets switched off in production.

6.12 Read: algorithm specifications E.1, technical documentation §7.4.
     Tests: L-008 to L-010, CLS-10.
     A paused run is a row with its context. Resuming arrives as a separate
     request, possibly on a different instance.

6.13 Read: algorithm specifications E.8. Tests: CLR-01 to CLR-05.
     Resolution completes for every concept before any clarification is
     raised. Three ambiguities produce one clarification with three items.
     Sequential asking is a defect.

6.14 Read: technical documentation §2.6 ask and respond_clarification.
     Tests: L-001 to L-005.

6.15 Read: reference/console.html Workbench, all five trace sections.
     Tests: N-001 to N-011.
     The stage rail advances with an elapsed counter. Never a bare spinner.

6.16 Read: technical documentation §11.3 concept readiness, reference/console.html
     Vocabulary. Tests: CLR-06, R-024.
     Readiness is the column an agent team plans against.

6.17 Read: technical documentation §11.4 export and §11.2 the discovery question set.
     Tests: CLR-07, CLR-08.
     The export is a deliverable of the engagement, not a debugging aid.

6.18 Read: technical documentation §11.2 the discovery question set.
     Tests: CLR-08.
     Seed the reinsurance discovery question set. Each question records
     the ambiguity it is designed to provoke.

6.19 Read: implementation plan Slice 1b, technical documentation §11.
     Tests: ING-33 to ING-36.
     A filing party header maps to a term like any other column. An unmapped
     header is refused and named, never guessed.
```

## 9. Review prompts

Useful between items, and after the four hand-written ones.

**After any item:**
```
Review the last commit against docs/implementation-plan.md item <N> and
AGENTS.md. Report only violations and unmet test IDs. Do not fix anything.
```

**Before a phase gate:**
```
Read the gate criteria for phase <P> in docs/implementation-plan.md.
For each criterion, name the test that proves it and whether it passes.
Report any criterion with no test. Do not write code.
```

**Periodically:**
```
Generate the traceability matrix: every entity, screen and endpoint in the
specifications against the test IDs covering it. Report items with zero
coverage. Do not write tests.
```
