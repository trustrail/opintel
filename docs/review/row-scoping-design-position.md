# Design position: row scoping and admission

Status: **5.37 ready for implementation**, not implemented. The four readiness questions are resolved by the decisions below. Implementation starts with the credential migration on a separate prompt. Items 5.38 and 5.39 record interfaces and console responsibilities only; their implementation designs are not supplied here.

## Current state at design recording, before 5.37

A pool holds at most **one current credential**, with at most one retiring credential during rotation. [`027_pools.up.sql`](../../migrations/027_pools.up.sql) enforces `one_current_key_per_pool` and `one_retiring_key_per_pool`. Issuance in [`keys.ts`](../../src/modules/pools/infrastructure/keys.ts), including its insert at line 78, creates `agent:<project>:<pool_key.id>` and provisions that alias with the provider. Rotation acts on the pool's current/retiring pair and issues a new key record and alias.

Consequently, every agent using a pool's current credential shares one custody alias. A retiring credential can retain its earlier alias during grace; that is credential-version history, not an independent agent identity. Nothing in authorization, row scope or custody identity is per agent today. Self-declared `agentId` does exist for presence and evidence, but it is not an authenticated principal and must never authorize a scope grant. A receipt naming an alias currently identifies the shared credential, not a separately admitted agent.

## 5.37 — Row entitlements by filter

### First precondition: pools become groups of credentials

Implement this **first inside 5.37**, before per-agent scope references or challenges:

- A pool groups several credentials. Each logical credential is issued to one agent, has its own custody alias `agent:<project>:<credential>`, and rotates independently.
- Move the pool-level current/retiring pair and uniqueness constraints to the credential. Distinguish the credential identity from its rotating key versions; rotation must not turn one agent into another principal.
- Use a new forward migration, never edits to applied migration 027. Existing pools migrate to **one credential per pool**, preserving their current/retiring keys, grace and unchanged behavior. No forced credential redistribution is required merely to migrate. Existing receipts and live grants retain their recorded alias and remain interpretable.

Without this precondition, per-agent scope references and “redeemed by <alias>” cannot distinguish agents sharing a pool key. Assigning different self-declared agent IDs does not repair that identity boundary.

### Credential alias ownership — decided

A custody alias belongs to the credential, not to a key version, and is permanent for the credential's life across rotations. New credentials derive `agent:<project>:<credential>` from their credential id. Rotation never re-registers an alias at the provider. **Reason:** replacing authentication material must not change the recipient identity or strand its live grants.

Each migrated credential takes its current key's alias as its permanent alias. Existing retiring key versions retain their own alias and live grants until grace ends; then that legacy alias is retired at the provider by revoking any escrow still addressed to it. Historical key aliases and receipts remain recorded. For a pool without a current key, retain its latest key's alias; an empty pool receives a new credential identity with no key. This does not make an unusable key usable.

Revoking a key no longer changes identity. Revoking the credential is the act that ends its alias and its live grants, with a confirmed grant count; the same lifecycle hook will revoke its scope grants when row scoping is built. Existing pool entitlements are unchanged. Receipts record the calling credential id and the alias actually used, including a migrated retiring key's legacy alias during grace.

### Decisions and grammar

An administrator writes a row entitlement in the console beside the column treatments, **per object and per pool**. For example:

```text
region = 'EU' AND status <> 'closed'
```

Postgres is the source of truth. Store the expression with its decision identity, actor, time, object and pool.

This is an **expression grammar, not SQL**: columns, comparison operators, `IN`, `AND` / `OR` / `NOT`, typed literals and scope references. Validate the expression and literal types against the catalogue at save time. Use one translator per source type; do not pass administrator text through as source SQL.

Scope governs reading; treatment governs returning. A predicate input may carry **any treatment**, including withheld or undecided. Push the predicate down to the source only when **every column it names is clear**. Otherwise the Engine applies it at the read boundary, before treatments, as it treats. Scope inputs must not become returned columns merely because filtering needs them. This requires an explicit extension of B.3's current read-plan rule, which otherwise omits withheld/undecided columns; do not silently broaden that existing plan.

Aggregate-only operations aggregate **within scope**, and the existing disclosure threshold applies within that scope. They must not aggregate the whole source and filter afterward.

### Static comparison contract — decided (5.37 step 2)

The grammar admits columns, comparisons (`=`, `<>`, `<`, `<=`, `>`, `>=`), `IN`, `AND`/`OR`/`NOT`, parentheses and `IS NULL` / `IS NOT NULL`. `scope(domain)` is parsed as a reserved set reference and refused at save with “scope references arrive in step 3”. No SQL, functions, arithmetic or implicit coercion is accepted.

- SQL three-valued logic: comparison with NULL is unknown; NOT unknown is unknown; AND/OR use SQL truth tables; only true admits a row. IS NULL / IS NOT NULL explicitly test nullness. Consequently `NOT (status = 'closed')` excludes null status rows.
- Text comparison is case-sensitive and byte-wise (Unicode code-point order), with no trimming or normalisation. PostgreSQL pushdown explicitly uses `COLLATE "C"`. Another source translator must name an equivalent or decline text pushdown.
- Integers and decimals compare exactly using a decimal library, never JavaScript doubles. Catalogue types determine literal bounds and scale; out-of-range literals are refused at save. Floating-point values compare by their exact represented value in both paths; the editor warns that equality on floats is rarely intended.
- Date/time literals are ISO 8601 only. Zoned timestamps compare as instants; unzoned timestamps and dates compare as stored values, labelled in the editor. No implicit timezone conversion.
- Literals are catalogue-typed scalars. Cross-family comparisons, implicit coercion, arrays, JSON and composite comparisons are refused with a validation message.
- Equivalence is an executable contract: each predicate shape is tested through source pushdown and Engine filtering on nulls, mixed case, non-ASCII text, boundary numbers and zoned timestamps. An operator/type without established equivalence receives no pushdown.

Static decisions resolve at architecture step **3**; **3a** remains reserved for scope lookups. Filter-only columns travel separately from returned columns and never enter a staging table or agent-visible view. Step 2 implements no scope relationships or challenge.

### Step 2b — editing and scale, ready

The [row-entitlements console position](row-entitlements-console-position.md) resolves the editing and inheritance decisions. Its model extends the step 2 object × pool decisions into pool overrides alongside object defaults and future project tag rules. **Composition is tag rule AND object default AND pool override**, including every level present, not replacement. Resolve at step 3; receipts name every contributing decision and one effective-predicate hash, retaining literal privacy and historical immutability.

An object with any row decision is scoped. If no tag rule, default or caller-pool override applies, it returns zero rows with the existing Activity mark and Needs You finding. Only an object with no decisions at any level is unscoped. This preserves step 2's missing-pool behavior. Explicit widening is refused; a future exemption decision with a reason and second approver is recorded, not designed.

Step 2b's pool editor shows the default read-only above the additional restriction. Its privileged, evidenced preview uses exact counts and deterministic sampling, with the same pool treatments and aggregate disclosure threshold as a real call. Catalogue tag binding is specified for future tag rules; scope-reference choices do not appear until declared domains arrive in step 3a, and the text save refusal remains in 2b. The console position records all seven decisions and their reasons. **Step 2b is ready; this update implements no code.**

### Static predicates and scope references

A static predicate never contacts SpiceDB. A reference such as:

```text
customer_id IN scope(customer)
```

resolves in architecture step **3a**, within step 3. Its logical relationship forms are:

```text
<domain>:<value>#viewer@pool:<id>
<domain>:<value>#viewer@agent:<alias>
<domain>:<value>#viewer@<domain>_group:<group>#member
permission read = viewer
```

The group userset form represents the domain group's members. These are logical forms: scope domains and values are project-prefixed in SpiceDB, following the existing schema convention (an object type per project or a project-id prefix on the object id). They are never shared across projects. A scope reference may name only a domain declared in the same project; the predicate validator refuses any other reference.

Run **one cursored LookupResources operation per receipt and domain**, consuming its pages and caching its result for that receipt. Do not repeat the lookup for each object, row or predicate use. Lookups must be at least as fresh as the project's latest grant zedtoken, and the receipt records the SpiceDB revision used.

Above a configurable value cap, the Engine stages the scope set and semi-joins it. Never create a relationship per source row: the E-016 measurements already establish why graph size matters. The cap and staged-set path are governance controls, not permission to expose the set or table totals.

### Fail-closed behavior

- An object with no row entitlement is unscoped and unchanged.
- Once an object is scoped, a caller pool with no predicate receives **zero rows**. Mark the call in Activity and raise **one Needs You item**, rather than silently presenting the empty answer as a finding.
- Scope resolution, required provenance and freshness must fail closed. No failed lookup or challenge may become an unscoped read.

### Receipt and provenance

Record the row line as:

```text
rows scoped · <pool or alias> · <decision id> · <predicate hash> · <provenance>
```

Include entitled row counts only, never table totals. Record the decision in force, a hash of the normalised predicate, the names of its referenced columns, and the SpiceDB zedtoken used for any scope reference. Never include predicate literals in the receipt. For an unscoped object, omit `rowScopes` entirely from receipt JSON and stored evidence, including sampled evidence; an empty list is not the historical absence signal. The decision row retains the predicate text for administrators; an auditor resolves the hash through the console's decision history.

Receipts are immutable. A receipt without a rows line means the object was unscoped at that time; the Activity summary renders nothing for it; expanded record metadata shows only the muted line **Rows: unscoped at the time of the call**, with no Rows section. Receipts with recorded row facts retain their Rows section. When an object becomes scoped, Activity records one event: **object X scoped by decision Y at T**. There is no rewriting or backfill.

Credential admission provides provenance **agent credential**. A session that passes the custody-provider challenge provides **bound to credential (<provider>)**. The challenge is a nonce packet escrowed through the existing provider port, addressed to the credential's alias and redeemed once per session, with configurable TTL.

A per-object **require bound** switch, **default off**, requires the challenge for credential-admitted sessions reading scoped objects. A credential-only session that has not passed it cannot read that object. For issuer-admitted sessions in 5.39, issuer token validation satisfies the switch and the receipt says **verified by <issuer>**; no challenge is issued. A challenge is evidence of credential possession, not permission to change scope.

The provenance ladder is:

| Level | Receipt wording |
|---|---|
| Lowest | asserted by platform |
| Credential | agent credential |
| Possession established — peers, not ranks | bound to credential (<provider>) **or** verified by <issuer> |
| Delegation, when 5.39 adds it | delegated subject |

The two possession words describe different admission paths, not a ranking of provider binding against issuer verification.

Use the architecture's single numbering, not a second parallel flow:

| Step | Addition |
|---|---|
| 2a | For credential admission only, issue the session challenge: escrow the nonce packet at the custody provider addressed to the alias |
| 2b | For credential admission only, complete the challenge by redemption; establish the bound provenance for the session under its configurable TTL |
| 3a | Resolve and receipt-cache each scope domain, at the required SpiceDB revision |

Later query/treatment and custody-release steps retain their existing numbers, including 7 and 7b.

### Writes and reconciliation

**Console only** in 5.37: the predicate editor on object × pool entitlements, and scope relationships on pool and agent cards. Agents never write entitlements, scope grants or relationships.

Scope grants are Postgres rows containing **principal, domain, value or group, source, actor, created, revoked and zedtoken**. They are mirrored to SpiceDB in the same transaction; lookups use at least the project's latest grant zedtoken. Both the grant and returned revision must be recorded, rather than treating an unconfirmed relationship write as a successful grant. This position records the required write contract; it does not claim that a Postgres transaction alone supplies cross-datastore atomicity.

A reconciliation job compares grant rows to relationships **on schedule and after restore**. Drift raises a Needs You item and is **never auto-repaired**. Postgres remains the source of truth; drift is a fault for a person to investigate, not authorization to invent or restore a grant automatically.

### Console and proof scope

The slice includes the predicate editor, the object's scoped mark, pool and agent scope cards, Activity's rows line, and the missing-scope/drift Needs You items. The exposure bar remains **column-based and unchanged**.

Proof obligations for implementation:

- Forward migration preserves one-credential existing pools and their behavior; additional agents receive distinct credentials/aliases; rotations are independent.
- Grammar/catalogue validation, translator safety, and both clear-input pushdown and treated-input Engine filtering; filter-only inputs do not escape.
- Static predicates make no SpiceDB call; scope references use receipt/domain caching, cursored lookup, freshness and recorded revision; capped/staged sets semi-join correctly without per-row relationships.
- Unscoped objects remain unchanged; scoped objects with no pool predicate return zero, record the scoped outcome and produce the actionable finding. Aggregation and disclosure thresholds operate within scope.
- Challenge replay/expiry and the default-off required-binding switch fail closed; issuer validation satisfies the switch without a challenge. Receipts distinguish the provenance peers without table totals or predicate literals, retain the normalised predicate hash and referenced column names, and expose the historical unscoped boundary without backfill.
- Console-only grant writes, revocations, project isolation, failure paths, scheduled/restore reconciliation and non-repairing drift findings.
- Add a performance case at the staged-set cap: a scoped object must remain inside **K-007's unchanged 2,000ms warm budget**. Record it as a steady-state measurement, not a retry or increased budget.

### Readiness decisions

1. **Predicate visibility — decided.** The decision row holds predicate text and the console shows it to administrators as any decision. The receipt carries the decision id, a hash of the normalised predicate and referenced column names, never literals. An auditor resolves the hash through the console's decision history. **Reason:** receipts are shared with agents and later auditors; literals such as customer ids and regions may themselves be scoped data. Explanation must not disclose that data.

2. **Receipts before scoping — decided.** Receipts are immutable and never rewritten. No rows line means the object was unscoped at the time; the Activity summary renders nothing, and expanded record metadata shows one muted line, “Rows: unscoped at the time of the call”, without a Rows section. Receipts with a rows line keep their Rows section. Absence remains the data signal; the console is quiet until the reader expands the metadata. Becoming scoped produces one Activity event identifying the object, decision and time. No backfill. **Reason:** the timeline must show the boundary from recorded facts, without attributing a later decision to an earlier answer.

3. **Project isolation — decided.** Scope domains and their values are project-prefixed in SpiceDB using the existing schema convention: object type per project or project id as an object-id prefix. They are never shared across projects. The predicate validator refuses references to domains not declared in the same project. **Reason:** scope relationships obey the same project isolation boundary as every other relationship; a scope reference cannot widen it.

4. **Challenge under issuer admission — decided.** The challenge proves possession of an Opintel-issued credential. For credential admission, require bound means the challenge; for issuer admission, token validation satisfies it, the receipt says “verified by <issuer>”, and no challenge is issued. Bound to credential and verified by issuer are peers in the provenance ladder above. **Reason:** an issuer-validated token already proves possession to the issuer's standard. A second credential challenge would conflate two admission paths rather than establish additional scope authority.

All four readiness questions are resolved. **5.37 is ready**; implementation begins with the credential migration, on a separate prompt. This position does not implement 5.37 or expand 5.38/5.39 beyond their recorded interfaces.

## 5.38 — Scope relationships derived from customer systems

**Interface only; do not design the implementation here.** Declare a scope source object and a subject-to-principal mapping. The ingest watcher diffs that source on refresh and derives the scope grants. Each grant retains its source/provenance so **console edits to a derived grant are refused**.

This extends 5.37's grant interface, not agent write authority. Mapping semantics, refresh implementation and other derivation design are deliberately not chosen by this position.

## 5.39 — Admission by issuer

**Interface and console switch only.** A pool carries an admission policy:

- **credential only**;
- **issuer only**;
- **either**, for migration.

With issuer-only admission, architecture step 1 accepts an OAuth bearer token from a configured issuer: enterprise IdP or agent platform. Reuse the console's Google sign-in token-validation module, through the identity module's public boundary; do not build a second token-validation implementation or invent additional validation policy here. The current integration is the identity OIDC module (`OidcProviderPort`, `OpenIdClientAdapter` and its runtime); this position does not claim it already exposes the required agent bearer-admission interface.

Map `sub` to `agent:<issuer>:<sub>` and check pool membership in SpiceDB:

```text
pool:<id>#member@agent:<issuer>:<sub>
```

A valid token for a non-member returns nothing and raises a Needs You item naming the agent and issuer. A credential presented to an issuer-only pool is refused and recorded. An unreachable issuer fails the call; it **never degrades to credential admission**.

Custody aliases derive from the issuer subject. Receipt provenance becomes **verified by <issuer>**. A delegation claim naming the human the agent acts for intersects the agent's scope with that human's scope; it adds the delegated subject to the receipt. Delegation is the only remaining designed-not-built item of the architecture's §8 referenced by this position, not the technical documentation's §8 telemetry rules.

Record the pool's console admission-policy switch and these inputs, outcomes and provenance fields. Do not design validation beyond reuse of the existing token module. Issuer token validation satisfies the per-object require-bound switch without a challenge. Its “verified by <issuer>” provenance is a peer of “bound to credential (<provider>)”, as decided above.

### Credential revocation clarification — approved 2026-10-15

Credential revocation takes local effect atomically without custody-provider acknowledgement: revoke all key versions and destroy unreleased K2, then retry remote cleanup durably, including legacy aliases and already-redeemed grants. A provider outage must not leave a credential live. See [the approved position](custody-revocation-and-redemption-position.md) for concurrency, residual risk and share-release wording.
