# Opintel: Algorithm Specifications

**Companion to the Slice 1 technical documentation. These are the parts a code generator must not invent.**

Version 1.3. Current as of the Slice 1 documentation v1.1 and the implementation plan v2.0.
Consistent with: five treatments in Slice 1 (`reference` is Slice 3), demo sources rather than a sandbox mode, spreadsheet ingest as the second connector, the Slice 1a and 1b split, the clarification policy in E.8, and tokenization at the read boundary in the sidecar (A.6).

Each specification here is precise enough to implement without judgement calls, and each carries the tests that prove it. Where a decision is genuinely open, it says so and names a default rather than leaving silence for someone to fill.

---

# A. Tokenization

The property the product is sold on: the same input produces the same token in every source, so an agent can join across systems while no source releases a real identifier.

## A.1 Requirements

| # | Requirement | Why |
|---|---|---|
| A1 | Deterministic within a project. Same input, same token, in every source | Cross-source joins must hold |
| A2 | Not reversible without the key. A dictionary attack over a low-cardinality column must fail | A plain hash of a 3-value column is trivially reversed |
| A3 | Different across projects. The same customer identifier tokenizes differently in two projects | Projects are isolation boundaries |
| A4 | Stable across time. Rotation is a deliberate, disruptive act, never a side effect | Rotation invalidates every token an agent has seen |
| A5 | Format-preserving enough to survive the column type | A `varchar(20)` column cannot hold 64 hex characters |
| A6 | Computed per query in the sidecar as rows are read from the source, before anything enters a DuckDB session. Never stored | No persisted copy of treated data; a decision change applies to the next query; one column can carry a different treatment per pool without a copy per pool; plaintext never enters a DuckDB structure or its disk spill, and the key never appears in SQL |

## A.2 Construction

**HMAC-SHA256 with a per-project key, over a versioned and domain-separated payload, truncated and encoded.**

```
payload = "v1" || 0x00 || canon_id || 0x00 || domain || 0x00 || canonical_utf8(value)

token   = "v1" || "_" || domain || "_" || crockford32( HMAC_SHA256( key(projectId), payload )[0..15] )
```

Where:

- `key(projectId)` is 32 random bytes generated at project creation, stored in the vault as `vault://opintel/token-key/{projectId}`, and never in Postgres. It is used as raw bytes, never as hex or base64 text
- `canonical_utf8(value)` is the canonical form defined in A.3, encoded as UTF-8
- `"v1"` is the **envelope version**. It names the construction: HMAC-SHA256, the 128-bit truncation, Crockford encoding and this payload layout. Changing any of them means `v2`
- `canon_id` names **the canonicaliser and its version** (A.3.2), for example `stdtext1`, `stdnum1`, `stddate1`, `stdtime1` or `addr2`. Changing a canonicaliser changes the element's tokens without changing the envelope
- `domain` is the element's token domain, for example `c` for a customer identifier or `t` for a transaction. **Every tokenized element has one.** It is mixed into the MAC, so the same value in two domains produces unrelated bodies and stripping prefixes cannot join a customer to a transaction
- `[0..15]` takes the first 16 bytes, giving 128 bits. Truncation to 128 bits is safe for HMAC and keeps the token short
- Crockford base32 gives 26 characters from 16 bytes: most significant bit first, the final group right-padded with zero bits, alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`

**`domain` and `canon_id` must match `[a-z0-9]+`.** No underscore, because the token splits on `_`. No null byte, because it delimits the payload. No empty value. An element whose domain or canonicaliser id fails this is refused when the entitlement is set, not at query time.

**The 0x00 delimiters prevent boundary sliding.** Without them, domain `a` with value `bc` and domain `ab` with value `c` would produce the same bytes.

**Result:** `v1_c_AQQBQ9RC399G23350RD6V757AC` for `ACME-001` in domain `c` under the test key in A.8's reference vectors, always `v1_`, then the domain, then `_`, then 26 characters.

**Why not a random surrogate held in a mapping table.** A mapping table is reversible by anyone with database access, has to be replicated to every source, and turns tokenization into a write path. HMAC needs no state beyond the key.

**Why not format-preserving encryption.** FPE preserves the exact alphabet and length, which is attractive for a fixed-width identifier, but the standard constructions are slow in a query path and the implementations are hard to audit. If a customer needs an exact-format token in a later slice, this is where FPE attaches.

## A.3 Canonicalisation

Two records that mean the same customer must tokenize the same, or the join fails. Every tokenized element has a **mode**, taken from its type family: text, number, date or timestamp. The mode decides the canonical form.

**The input is the source's own text representation of the value**, read as A.6 describes. Never a value a database driver has already parsed into a native number or date: drivers apply host time zones, lose precision and render numbers inconsistently, and each of those changes tokens silently.

**In every mode, `NULL` produces `NULL`.** A null is never tokenized into a value.

**Every rule below is defined explicitly rather than delegated to a language built-in**, because built-ins disagree between languages and versions. The reference vectors in A.8 prove the implementation matches.

### Text mode

Applied in this order:

1. If a domain canonicaliser is registered for the element (A.3.2), apply it
2. Unicode NFKC normalisation
3. Trim leading and trailing characters in the **trim set**
4. If the element is `caseInsensitive`: full Unicode case folding, then NFKC again

**The trim set** is the Unicode `White_Space` property plus U+FEFF: U+0009 to U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000 to U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. It is an explicit list because Python's `strip()` and JavaScript's `trim()` disagree on six of these. U+FEFF matters in practice: it is the byte-order mark Excel writes at the start of CSV exports, so it appears in the first cell of landed spreadsheets.

**NFKC runs before trim** because NFKC turns compatibility spaces such as U+00A0 and U+3000 into U+0020, which trim must then remove.

**Case folding is full folding** (Unicode `CaseFolding.txt`, statuses C and F), so `ß` folds to `ss` and `Straße` matches `STRASSE`. Lowercasing is not case folding. **NFKC is applied again after folding** because folding leaves 26 characters in a form NFKC changes, U+01F0 among them. This is the Unicode standard's form for caseless matching.

**`caseInsensitive` defaults to true for text elements.** It is a per-element setting because it is a data decision, not a technical one. Customer codes are usually case-insensitive. Free-text names usually are not, and folding them creates false joins.

**The empty string tokenizes.** It is a value, not an absence, and collapsing it into `NULL` loses a distinction that matters in reconciliation.

### Number mode

Input must match `-?(0|[1-9]\d*)(\.\d+)?`, the form Postgres `numeric::text` emits. The canonical form removes trailing zeros from the fractional part, drops the decimal point when no fraction remains, and turns `-0` into `0`. So `100`, `100.0` and `100.000000` all canonicalise to `100`.

**Numbers are canonicalised as strings, never through arithmetic.** Arithmetic types round: a 28-digit decimal context makes two distinct 40-digit values collide.

**Refused:** exponents (`1e2`), underscores (`1_000`), a leading or trailing decimal point, leading zeros (`007`) and any value that is not a string. Floating-point columns cannot be tokenized; cast them upstream to `numeric` or to integer minor units such as cents.

**Leading zeros belong to text, not numbers.** An integer column never renders `007`. A text column holding `007` is in text mode, where `007` and `7` are different values, unless a domain canonicaliser declares them equal. That is exactly the padded-reference case A.3.2 exists for.

### Date mode

`YYYY-MM-DD`, validated as a real calendar date. `2026-02-30` is refused. A date is never treated as midnight in some zone.

### Timestamp mode

Input grammar: `YYYY-MM-DD[T ]HH:MM:SS[.f{1,6}][Z|±HH[[:]MM]]`. Seconds are required, and a date alone is refused in timestamp mode.

Canonical form: `YYYY-MM-DDTHH:MM:SS.ffffffZ` in UTC, microseconds zero-padded to six digits, always 27 characters. **Never truncated to milliseconds**: two events half a millisecond apart must not join. A.3.1 governs values without a zone.

### A.3.1 Timestamps must not depend on where the sidecar runs

Converting to UTC is correct only when the source value carries a zone. Where it does not, a naive cast uses the host's timezone, and **the same value then tokenizes differently depending on which machine executed the query**. That is deterministic token drift and it silently breaks cross-source joins.

| Source value | Behaviour |
|---|---|
| `timestamptz`, or any value with an explicit offset | Convert to UTC, format as the timestamp-mode canonical form |
| `timestamp` without zone, element or schema has a declared source timezone | Interpret in that zone, convert to UTC. **Refused if the local time is ambiguous or nonexistent in that zone**: during a DST overlap the same wall time happens twice, during a DST gap it never happens, and picking one would be a guess |
| `timestamp` without zone, **no declared zone** | **Refuse.** The element cannot be tokenized until someone declares its zone |
| Unix epoch, seconds or milliseconds | Unit declared per element. **No inference from magnitude.** Converted to the timestamp-mode canonical form. Refuse if undeclared |
| `date` with no time | Date mode, never midnight in some zone. Formatted `YYYY-MM-DD` |

**Refusing is the right default and it will be unpopular.** The alternative is a join that works in staging and fails in production because the sidecar moved. The declaration is a one-line setting on the element and it belongs in the six week deployment alongside the other data decisions.

`sourceTimezone` and `epochUnit` are per-element settings. Neither has a default.

### A.3.2 Domain canonicalisation

Steps 1 to 5 handle text, numbers and timestamps. They do not handle entities whose equality is a domain judgement rather than a string comparison.

Real cases, all of which break a naive join:

- Civic addresses: `12 Jalan Ampang` against `12, Jln Ampang`, and unit numbers expressed four different ways
- Municipal or assessment roll numbers, where separators and leading zeros vary by system
- Company names, where suffixes, punctuation and legal forms differ across registries
- Cedant references, where one system pads to eight characters and another does not

**These cannot be solved generically and must not be guessed at.** A canonicaliser that decides `St` means `Street` is making a claim about the customer's data that may be false.

So: a declared extension point, applied as the **first** text-mode step, per element.

```ts
interface Canonicaliser {
  readonly canonId: string;            // 'addr2': name and version together, [a-z0-9]+
  canonicalise(raw: string): string;   // pure, deterministic, no I/O
}
```

| Rule | Reason |
|---|---|
| Registered per element, never global | The same rule is right for one column and wrong for another |
| Pure and deterministic. No network, no clock, no locale lookup | Anything else reintroduces the drift A.3.1 just closed |
| `canonId` carries the version and is recorded on the element. It enters the HMAC payload (A.2) | Changing a canonicaliser changes every token of that element, exactly like a key rotation. Putting the id in the payload guarantees two canonicaliser versions can never produce the same token |
| Changing it requires the same typed confirmation as key rotation | Because the consequence is the same: joins break |
| Ships as part of the industry pack where the domain is common | Address and roll-number handling is reusable within a market |

**A canonicaliser is established during the deployment**, alongside vocabulary and landing strategy. It is a data decision made with the customer, not a library choice made by an engineer.

**Where a canonicaliser exists it runs first**, then the remaining text-mode steps run on its output. The order matters: normalising Unicode before a domain rule sees the value would hide the distinctions the rule needs.

**Every tokenized element has a `canon_id`, even without a domain canonicaliser.** The built-in ids are `stdtext1`, `stdnum1`, `stddate1` and `stdtime1`, one per mode. A domain canonicaliser replaces `stdtext1` with its own id.

## A.4 Length and type handling

The token must fit the column it replaces.

| Target type | Behaviour |
|---|---|
| `VARCHAR` with no length, `TEXT` | Full token: `v1_`, the domain, `_`, then 26 characters. 30 characters plus the domain's length |
| `VARCHAR(n)` where n is at least the token length | Full token |
| `VARCHAR(n)` where n is shorter than the token | **The view widens the column to `VARCHAR`.** Truncating the token would create collisions |
| Numeric, date, uuid | The view changes the column type to `VARCHAR`, and `describe` reports the post-treatment type |

**`describe` always reports the post-treatment type**, so an agent never writes arithmetic against a token.

## A.5 Key management

| Concern | Rule |
|---|---|
| Generation | 32 bytes from a CSPRNG at project creation, before the first source connects |
| Storage | Vault only. A key in Postgres fails a startup assertion that scans for it |
| Distribution | Resolved through `VaultPort` by the sidecar at execution time, as 32 raw bytes, held in memory, never logged. **Only the sidecar resolves it.** The application process never holds the key and never imports the tokenizer |
| Rotation | A distinct command with a typed confirmation naming what breaks |
| Rotation effect | **Every token changes.** Cached agent results become unjoinable to new results. Prior evidence records remain valid because they record the token as released at the time |
| Rotation record | Written to the audit log with the reason. The project's `token_key_version` increments and appears in every evidence record from that point |

**Zero key buffers after use, but do not list it as a guarantee.** Node's HMAC copies the key into OpenSSL's memory, and a key delivered as text, for example by the development vault adapter reading an environment variable, exists as an immutable string that cannot be zeroed. The guarantee is that the key never leaves the sidecar process and never appears in a log, span, error message, SQL string or database row.

**Rotation is not a routine hygiene action.** The console says so: rotating breaks joins in any agent that has cached results, and there is no way to translate an old token to a new one.

### A.5.1 Key loss, and why escrow is not optional

HMAC is deterministic and irreversible without the key. **Losing a project's token key is unrecoverable and the damage is wider than it first appears:**

| What breaks | Why |
|---|---|
| Every cross-source join, permanently | The same value can no longer be shown to produce the same token |
| **Every historical evidence record** | A token in a March record cannot be reproduced, so the record can no longer be verified. The product's central claim fails retroactively |
| Any downstream system holding tokens | They become opaque strings with no provenance |

Rotation is a deliberate act with a known cost. Loss is the same cost, unplanned, and with no audit entry explaining it.

**Requirements**

| # | Requirement |
|---|---|
| K1 | The key is generated once, at project creation, and **backed up before the first source connects**. A project with no verified backup cannot connect a source |
| K2 | Backup is to a second custody location under the customer's control, not a copy in the same vault. A vault failure must not take both |
| K3 | **Restore is rehearsed, not assumed.** A scheduled job restores the key into an isolated context and re-derives a known sentinel token. A mismatch or a failure raises an observation |
| K4 | Every superseded key is retained after rotation, never deleted. Old evidence must stay verifiable |
| K5 | The key version is recorded on the project and on every evidence record, so a record names which key produced its tokens |
| K6 | Restoring a key is an audited operation requiring project and company administration, with a typed confirmation |
| K7 | Where the customer holds custody, **the contract states plainly that Opintel cannot recover a lost key**, and the console repeats it on the key screen |

**K3 is the one that matters.** A backup that has never been restored is a hope. The rehearsal is cheap, it runs unattended, and it converts an assumption into a fact somebody can point at.

**K4 changes the mental model of rotation.** Keys are not replaced, they accumulate. The current key produces new tokens; superseded keys remain available for verifying old records. That makes rotation safe to perform and makes the evidence store durable across it.

## A.6 Implementation at the read boundary

**Tokenization and masking run in the sidecar's own code, as rows are read from the source, before anything enters a DuckDB session.** DuckDB only ever receives treated values for tokenized and masked columns.

```
customer source --plaintext--> sidecar read loop --treated rows--> DuckDB staging
                                 canonicalise, tokenize or mask
                                 key held here only
```

**What this buys**, compared with registering a token function inside DuckDB:

- **Plaintext never enters a DuckDB structure**, including DuckDB's temp directory when it spills under memory pressure. Anything spilled is already treated
- **The key never appears in SQL.** A function registered in DuckDB would carry the key into statement text or a closure inside the SQL engine, where it could surface in query logs, profiling output or error messages
- **One implementation.** There is no second engine whose Unicode normalisation, case folding or trimming could differ byte for byte from the sidecar's

**Plaintext still passes through sidecar memory** for the instant it takes to canonicalise and hash each value. That is unavoidable, since a value cannot be hashed without reading it, and the ephemerality proof (C.5) covers the sidecar's row buffers as well as DuckDB.

### Reading from the source

- **Tokenized columns are read as the source's own text**, cast to text in the `SELECT` the sidecar issues. Never tokenize a value the driver has parsed: `node-postgres` reads naive timestamps in the host's local time zone, truncates timestamps to milliseconds and renders numerics with the column's scale
- **The source session's `TimeZone` is set to UTC** before reading, so `timestamptz::text` carries an offset the timestamp grammar accepts
- **Clear and `aggregate_only` columns carry source values by decision.** A sum over tokens would be meaningless, so `aggregate_only` is protected by query inspection (B.4), not by transformation. The accurate claim is therefore: every tokenized or masked column exists in DuckDB only in treated form

### Consequences

- **Predicates on tokenized columns cannot be pushed to the source.** An agent filtering on a token holds only the token; the source holds only plaintext. The sidecar reads, tokenizes, then filters. This holds for any tokenization design, but it means the `unsupported_pushdown` refusal in C.1 fires more often on tokenized columns
- **Joins on tokenized keys happen in the agent session, on staged tokens.** Two sources' tokenized columns join because the same canonical value produces the same token (A1)

### Implementation requirements

- **Case folding from a committed table** generated from Unicode's `CaseFolding.txt`, statuses C and F. Node has no case-folding function and `toLowerCase()` is not case folding
- **Trim with the explicit set in A.3**, never `String.prototype.trim`
- **Parse by grammar.** No `Date`, no `parseFloat` and no `Number()` anywhere on the canonicalisation path
- **Record the running Unicode version at sidecar startup.** Unicode's stability policies keep NFKC and case folding fixed for characters already assigned, but a Node upgrade can change tokens for characters assigned after the previously running version

## A.7 What tokenization does not protect against

Stated because a customer will ask, and because pretending otherwise is worse than the limitation.

- **Frequency analysis.** If one cedant accounts for 60% of rows, the token appearing 60% of the time identifies them to anyone who knows the distribution. Tokenization protects the identifier, not the shape of the data
- **Join-with-external-data.** An agent that can reach a public dataset and a tokenized one can sometimes re-identify by matching on unprotected columns
- **Inference across permitted answers.** Out of scope for the product, and §14 of the functional specification says so

Where these matter, the correct treatment is `aggregate_only` or `withheld`, not tokenized.

## A.8 Tests

| ID | Case | Expected |
|---|---|---|
| TOK-01 | Same value, two different sources, one project | Identical token |
| TOK-02 | Same value, two projects | Different tokens |
| TOK-03 | Same value, 10,000 iterations | Identical token every time |
| TOK-04 | `NULL` input | `NULL` output, never a token |
| TOK-05 | Empty string | A token, distinct from `NULL` |
| TOK-06 | `' ACME '` and `'acme'` on a case-insensitive element | Identical token |
| TOK-07 | The same pair on a case-sensitive element | Different tokens |
| TOK-08 | Unicode variants normalising to the same NFKC form | Identical token |
| TOK-09 | Numeric `7`, `7.0` and `7.000` on the same logical key | Identical token. `007` in number mode is refused; in text mode `007` and `7` differ unless a domain canonicaliser declares them equal |
| TOK-10 | Cross-source join on a tokenized key | Join returns the same row count as on the plaintext key |
| TOK-11 | Token format | Always `v1_`, the domain, `_`, then 26 Crockford characters |
| TOK-12 | Collision probe, 10 million distinct inputs | Zero collisions |
| TOK-13 | Key absent from the vault | Execution refuses. It does not fall back to a hash |
| TOK-14 | Key present in Postgres | Startup assertion fails |
| TOK-15 | Token appears in logs or spans | Never. Asserted against the field allowlist |
| TOK-16 | Rotation | All tokens change, `token_key_version` increments, audit entry written |
| TOK-17 | `describe` on a tokenized integer column | Reports `VARCHAR` |
| TOK-18 | Dictionary attack on a 3-value column without the key | Fails. The test computes all three candidate tokens with a wrong key and asserts no match |
| TOK-19 | Naive timestamp, no declared zone | **Refused.** Not cast using the host timezone |
| TOK-20 | Naive timestamp with a declared zone, sidecar running in two different host zones | Identical token from both |
| TOK-21 | Unix epoch with no declared unit | Refused. No inference from magnitude |
| TOK-22 | `date` column | Formatted `YYYY-MM-DD`, never midnight in a zone |
| TOK-23 | Element with a registered canonicaliser | Canonicaliser runs as the **first** text-mode step, and its `canonId` replaces `stdtext1` in the payload |
| TOK-24 | Canonicaliser attempting I/O or reading the clock | Rejected at registration |
| TOK-25 | Canonicaliser version bumped | Treated as a token-breaking change, typed confirmation required |
| TOK-26 | Two address variants under a declared canonicaliser | Identical token. The same pair without it, different tokens |
| TOK-27 | Project with no verified key backup | Cannot connect a source |
| TOK-28 | Restore rehearsal | Re-derives the sentinel token. A mismatch raises an observation |
| TOK-29 | Rotation | Superseded key retained, not deleted. Old records still verifiable |
| TOK-30 | Evidence record | Names the key version that produced its tokens |
| TOK-31 | Every vector in `sidecar/tokenize/reference/vectors.json` | Exact token match, and each of the 14 rejection vectors refused. The vectors come from an independent implementation; the implementation under test never modifies or regenerates them |
| TOK-32 | Same value, domains `c` and `t` | Different bodies, not only different prefixes |
| TOK-33 | Domain or `canonId` containing `_`, a null byte, uppercase, or empty | Refused when the entitlement is set |
| TOK-34 | Leading U+FEFF, trailing U+0085; trailing U+001F | The first two trim to the plain value's token; U+001F is kept and the token differs |
| TOK-35 | Naive timestamp in a declared zone during a DST overlap, and during a DST gap | Both refused |
| TOK-36 | A full tokenization run with log capture | The key, in raw, hex and base64 forms, appears in no log line, span or error |
| TOK-37 | A tokenized column read through the sidecar | Read as source text; a driver-parsed `Date` or `number` never reaches the canonicaliser |
| TOK-38 | Staged DuckDB tables and DuckDB's temp directory after a run with tokenized columns | Contain no plaintext value of any tokenized or masked column |

---

# B. The view compiler

Turns entitlements into the DDL a pool's session runs against. This is where the entitlement model becomes real, so it is deterministic, total, and has no branch that silently emits nothing.

## B.1 Signature

```ts
compileViews(input: {
  poolId: PoolId;
  boundSources: SourceRef[];
  objects: CatalogObject[];          // active only
  elements: CatalogElement[];        // active only
  entitlements: Map<ElementId, Entitlement>;
  policyVersion: number;
}): ViewDefinition[]

type ViewDefinition = {
  catalog: string;      // source alias
  schema: string;
  name: string;
  ddl: string;
  columns: CompiledColumn[];         // for describe and for evidence
  constraints: AggregateOnly[];      // enforced at query inspection, not in DDL
};
```

## B.2 Algorithm

```
for each bound source S:
  for each active object O in S:
    cols  := []
    aggs  := []
    for each active element E in O, in ordinal order:
      ent := entitlements.get(E.id)
      if ent is absent:            continue        // UNDECIDED: omit entirely
      switch ent.treatment:
        'withheld':                continue        // omit entirely
        'clear':      cols.push(identifier(E))
        'tokenized':  cols.push(tokenExpr(E))
        'masked':     cols.push(maskExpr(E))
        'aggregate_only':
                      cols.push(identifier(E))      // present, constrained at query time
                      aggs.push(E)
    if cols is empty:
      emit a view with zero columns? NO -> omit the object entirely
    emit CREATE VIEW <pool>.<S.alias>.<O.duckdbName> AS SELECT <cols> FROM <base>
```

**Three rules that are easy to get wrong.**

**Undecided and withheld both omit, and they are not the same thing.** Undecided means nobody has decided. Withheld means someone decided no. They produce identical DDL and different behaviour everywhere else: `describe` lists withheld columns marked as such and omits undecided ones entirely, and a query naming each gets a different error code. The compiler must record which is which in `columns` even though neither appears in the `SELECT`.

**An object with no readable columns is omitted, not emitted empty**, because a zero-column view is a DuckDB error.

But omission alone degrades the error. An agent querying an omitted object gets `Table with name orders does not exist`, which is indistinguishable from a typo and tells it nothing actionable. It will retry, or report that the data is unavailable, or conclude the table was never there.

**Resolution: intercept at the resolver, not in the DDL.** Every identifier in the parsed statement is resolved against the pool's namespace *before* execution. Three outcomes:

| Identifier resolves to | Return |
|---|---|
| An object in the pool's view | Proceed |
| An object in the catalogue, omitted because every column is withheld or undecided | `object_unavailable`, naming the object and whether it is withheld or undecided |
| Nothing in the catalogue at all | An ordinary not-found error |

**Not a dummy column.** Emitting `_opintel_unauthorized BOOLEAN` would put an artifact in the namespace that agents can discover, select, and reason about, and it would appear in `describe`. The resolver approach keeps the namespace clean and produces a better error.

**This distinguishes three states an agent needs to tell apart:** the object does not exist, the object exists but nothing in it was decided, and the object exists but everything in it was withheld. The middle case is an administrator's task; the last is a deliberate decision; the first is the agent's mistake. One generic error would collapse all three.

**Ordinal order, not alphabetical.** `SELECT *` should return columns in the order the source has them, or agents that positionally index results break.

## B.3 Expression forms

```sql
-- clear
"customer_id"

-- tokenized
opintel_token("customer_id", 'c_') AS "customer_id"

-- masked, by mask kind on the entitlement
opintel_mask_last4("card_number")     AS "card_number"   -- ••••1234
opintel_mask_email("email")           AS "email"         -- •••@example.com
opintel_mask_year("birth_date")       AS "birth_date"    -- 1978
opintel_mask_all("notes")             AS "notes"         -- ••••

-- aggregate only: plain column, constrained by the query inspector
"amount"
```

> **Superseded for tokenized and masked columns by A.6.** Treatments are now applied in the sidecar as rows are read, before DuckDB, so `opintel_token` and the `opintel_mask_*` functions above are not registered in any DuckDB session. The compiler's output for these columns becomes a read plan telling the sidecar which column receives which treatment, and the view selects the already-treated column. Revise this section with item 4.4 before implementing the compiler.

Identifiers are always double-quoted, and a quote inside an identifier is doubled. The compiler never interpolates a name without passing it through `quoteIdent()`, which is the only place identifier text becomes SQL.

## B.4 Aggregate-only enforcement

Cannot be expressed as a view column, because a view cannot say "you may see `SUM(amount)` but not `amount`". It is enforced by inspecting the parsed query before execution.

```
for each aggregate-only element E referenced in the query:
  every reference to E must be a direct argument of an aggregate function
  the query must have a GROUP BY, or be a single-row aggregate
  refuse if E appears in: SELECT without aggregation, WHERE, ORDER BY,
                          GROUP BY, HAVING outside an aggregate, or a window frame
```

**And a minimum group size, measured after filtering, not before.**

The naive check validates the group definition: `GROUP BY customer_id` is refused because it yields one row per customer. That check is necessary and **it is not sufficient**. Consider:

```sql
SELECT city, SUM(amount) FROM orders
WHERE transaction_id = 'tx_8f21a3'
GROUP BY city
```

`GROUP BY city` passes any group-definition check. The `WHERE` clause reduces the input to one row, so the sum is that row's `amount`, exposed exactly. **The aggregate is the raw value wearing a `SUM()`**, and the grouping column was never the problem.

**So the check is on post-filter cardinality per group**, evaluated in two stages:

```
STAGE 1, before execution, deterministic
  estimate rows per group from table statistics, the WHERE predicates
  and join selectivity
  if the estimate for any group is below aggregateMinGroupSize:
      refuse
  if the estimate is within a factor of 2 of the threshold:
      mark the execution for stage 2

STAGE 2, during execution, only when marked
  compute COUNT(*) per group alongside the requested aggregates
  if any returned group has a count below the threshold:
      refuse the whole result. Do not return the compliant groups
```

**Stage 2 exists because estimates are estimates.** A statistics-based prediction of 40 rows can be 1 in reality, and the product cannot rely on a planner's guess for a disclosure control. It runs only when the estimate is close to the line, so the common case costs nothing.

**Refusing the whole result rather than the small groups is deliberate.** Returning the compliant groups and silently dropping the rest leaks by omission: an analyst who knows the city list can see which ones vanished, and that is itself the disclosure.

**Predicates on aggregate-only columns are refused outright**, per the list above, which closes the other route to the same attack: filtering on the protected value and reading the group that survives.

Refusal code: `entitlement_missing`, naming the element, the threshold and which stage refused, so an administrator can decide whether the threshold is wrong or the question was.

**`aggregateMinGroupSize` defaults to 5 and is a project setting.** It is a disclosure-risk judgement, not a technical constant, and it belongs with the customer.

## B.5 When views are recompiled

| Trigger | Scope |
|---|---|
| An entitlement changes | That pool only |
| A bulk set | That pool only, once, after the batch |
| A source is bound or unbound | That pool |
| Introspection applies a diff | Every pool bound to that source |
| A pattern rule creates entitlements | Every affected pool |

Compilation is pure and fast, so views are compiled **on demand at session creation** and cached by `(poolId, policyVersion)`. There is no background job keeping a materialised set in sync, because a stale view is a correctness failure and a cache keyed on the version cannot go stale.

`policyVersion` increments on the project for any entitlement change, which invalidates every pool's cache in that project. That is coarser than necessary and it is the right trade: correctness over cache hit rate.

## B.6 Tests

| ID | Case | Expected |
|---|---|---|
| VC-01 | Element with no entitlement | Absent from the DDL |
| VC-02 | Withheld element | Absent from the DDL |
| VC-03 | Undecided and withheld in one object | Identical DDL, different `columns` metadata |
| VC-04 | Object where every element is undecided | Object omitted entirely, no empty view |
| VC-05 | Column order | Matches source ordinal order |
| VC-06 | Identifier containing a double quote | Correctly escaped, no injection |
| VC-07 | Identifier that is a DuckDB reserved word | Quoted, resolves |
| VC-08 | Same element, two pools, different treatments | Two DDL sets, neither affects the other |
| VC-09 | Tokenized integer | Column type reported as `VARCHAR` |
| VC-10 | Aggregate-only in a bare `SELECT` | Refused |
| VC-11 | Aggregate-only inside `SUM()` with `GROUP BY` | Allowed |
| VC-12 | Aggregate-only in `WHERE` | Refused |
| VC-13 | Aggregate-only in `ORDER BY` | Refused |
| VC-14 | `GROUP BY` producing groups below the minimum | Refused |
| VC-15 | 5,000 elements | Compiles in under 200ms |
| VC-16 | Determinism | Same inputs produce byte-identical DDL |
| VC-17 | Cache | Second session at the same `policyVersion` does not recompile |
| VC-18 | Entitlement change | Next session recompiles |
| VC-19 | Query naming an object omitted because everything is withheld | `object_unavailable` naming it as withheld, not a not-found error |
| VC-20 | Query naming an object omitted because everything is undecided | `object_unavailable` naming it as undecided |
| VC-21 | Query naming an object that never existed | Ordinary not-found error, distinguishable from both |
| VC-22 | No dummy column anywhere | `describe` and `duckdb_columns()` contain no `_opintel_*` artifact |
| VC-23 | **`GROUP BY city WHERE transaction_id = X`** | **Refused.** The group definition passes, the post-filter cardinality does not |
| VC-24 | Estimate above the threshold, reality below it | Stage 2 catches it and refuses |
| VC-25 | Estimate far above the threshold | Stage 2 does not run. No `COUNT(*)` overhead |
| VC-26 | Result with some groups compliant and some not | **Whole result refused.** Compliant groups are not returned |
| VC-27 | Predicate on an aggregate-only column | Refused before planning |
| VC-28 | Threshold changed on the project | Takes effect on the next execution, recorded on the run |

---

# C. The DuckDB session

The control the entire entitlement model rests on. If agent SQL can reach a base catalog, every treatment above is decoration.

## C.1 The two-session construction

**Default and preferred.** Base catalogs are attached in a privileged session the agent never touches. The pool's views are materialised into a second session that has no attachments at all.

```
PRIVILEGED SESSION (never runs agent SQL)
  1. ATTACH each bound source read-only, under an internal alias
  2. apply hardening (C.2), leaving external access ON for the scanners
  3. for each view definition:
       CREATE TABLE __staging.<catalog>__<schema>__<object> AS
         SELECT ... FROM <internal alias>...        -- the compiled SELECT
     (materialised, so the agent session needs no source access)
  4. export the staged tables to the agent session

AGENT SESSION (runs agent SQL)
  5. no ATTACH of any source. No internal alias exists in this catalog
  6. register opintel_token and the mask functions, key bound in closure
  7. create the pool's schema and expose the staged tables under their
     three-part names: <source_alias>.<schema>.<object>
  8. apply hardening (C.2)
  9. SET lock_configuration = true            <- MUST BE LAST
  10. run agent SQL
  11. close, free, release
```

> **Superseded in part by A.6.** Step 6 is removed: no token or mask function, and no key, exists in any DuckDB session, and in particular never in the agent session, which runs agent SQL. For objects with a tokenized or masked column, steps 1 and 3 change: instead of attaching the source and running the compiled `SELECT` inside DuckDB, the sidecar reads rows through its source connector, treats them in its own code, and appends them to the staging tables. Objects whose columns are all clear or `aggregate_only` may still use the attach path. Revise this section with item S2.

**Why materialise.** The alternative, a view in the agent session over an attachment, leaves the attachment reachable. Materialising costs memory and a scan; it buys a session where the base catalogs do not exist to be found.

**The cost is real and must be bounded.** Materialisation happens per execution against the query's predicates pushed down where the scanner supports it, not a full table copy. Where pushdown is unsupported and the object is large, the execution refuses with `unsupported_pushdown` rather than materialising a hundred million rows.

### C.1.1 The streaming path, and its exact condition

Materialisation exists so that the agent session holds no attachment. Where **nothing in the query needs rewriting**, there is no projection to protect and the staging step buys nothing but latency.

**The condition, which must be evaluated conservatively:**

```
streamingPermitted(query, pool) =
      every object referenced is in the pool's view
  AND every column referenced, including in WHERE, JOIN, GROUP BY,
      ORDER BY and every subquery and CTE, resolves to treatment 'clear'
  AND no aggregate-only element is referenced anywhere
  AND no column of any referenced object carries a treatment other
      than 'clear'                                  <-- see below
  AND the SQL subset check has passed
```

**The fourth clause is the one that is easy to get wrong and it is deliberately stricter than necessary.** It is not enough that the *selected* columns are clear. If the object contains a tokenized or withheld column at all, the base table must not become reachable, because a later clause, a `SELECT *` expansion, or a planner rewrite could surface it. So: an object is streamable only when **every** column in it is clear.

That is conservative, and it should be. A wrong answer here reopens the isolation hole that C.1 exists to close, and the failure would be silent.

**When permitted**, the agent session attaches the source read-only under the pool's own namespace, runs the query with pushdown, and streams results. Hardening and `lock_configuration` still apply, the SQL subset still applies, and the bypass suite must pass against this path too.

**When not permitted**, the two-session construction runs as specified.

| | Streaming | Staged |
|---|---|---|
| Base catalog reachable | The object is attached, but every column in it is clear, so there is nothing to protect | Not attached at all |
| Bypass suite | Must pass | Must pass |
| Chosen by | The condition above, evaluated per execution | Default |
| Recorded on the run | `executionPath: streaming` | `executionPath: staged` |

**The path is recorded on every evidence record.** A reviewer asking why one query was fast and another slow gets an answer, and an auditor asking whether the isolation applied gets a per-request answer rather than a policy statement.

**Build order matters.** The staged path ships first and the streaming path is an optimisation added afterwards, behind the same bypass suite. Building them together invites the condition being loosened to make a slow query fast.

**The permitted alternative**, for a source where materialisation is impossible for performance reasons: attach in the agent session under a name outside the agent's namespace, and enforce in the SQL subset check that only `<source_alias>.<schema>.<object>` identifiers appear. This makes the subset check load-bearing, so it requires its own review and the full bypass suite runs against it specifically.

## C.2 Hardening

Applied to every session before any agent SQL, in this order.

```sql
SET enable_external_access      = false;   -- no httpfs, no file reads
SET autoinstall_known_extensions = false;
SET autoload_known_extensions    = false;
SET allow_unsigned_extensions    = false;
SET memory_limit    = '<per pool>';
SET threads         = <per pool>;
SET temp_directory  = '';                  -- no spill
SET max_temp_directory_size = '0';
SET lock_configuration = true;             -- LAST. Nothing after this line.
```

**`lock_configuration` must be the final statement.** Without it, agent SQL can `SET enable_external_access = true` and undo everything above. A test asserts that the last statement executed before agent SQL is this one, by inspecting the session's statement log rather than by reading the source.

## C.3 The permitted SQL subset

Checked twice: in the API before dispatch, and in the sidecar before execution. Both operate on the **parsed statement**, never on the raw text with a regular expression.

**Refused:** `ATTACH`, `DETACH`, `COPY ... TO`, `INSTALL`, `LOAD`, `PRAGMA`, `SET`, `CALL`, `EXPORT`, every file-reading table function (`read_csv`, `read_parquet`, `read_json`, `glob`), every write statement, and `CREATE` of anything except a CTE.

**Permitted:** `SELECT`, `WITH`, `VALUES`, and `DESCRIBE` against the pool's own objects.

**Identifier check.** Every table reference in the parsed statement must resolve to a three-part name the pool owns. A reference to anything else fails with `sql_not_permitted` naming the construct, so the agent can rewrite rather than guess.

## C.4 Resource governance

| Limit | Enforcement |
|---|---|
| Memory | `memory_limit`. Exceeding fails; it does not spill |
| Threads | `threads` per pool |
| Wall clock | Cancellation at the timeout, then session teardown |
| Rows | `LIMIT` injected at the outermost level, `truncated: true` returned |
| Concurrency | Semaphore per pool, queued to a bound, then refused |
| Source connections | Ceiling per source, opened per execution, closed in a `finally` |

**The customer's database is the scarce resource, not the sidecar.** An accidental cartesian join hits their production Postgres. Statement timeouts on the source side matter as much as the sidecar's own limits, and both appear in the console's query settings.

## C.5 Ephemerality

| Guarantee | Enforcement |
|---|---|
| Nothing on disk | `temp_directory` empty, spill disabled, read-only root filesystem, `tmpfs` sized zero |
| Nothing after the response | Instance closed in a `finally`, memory freed before the response returns |
| Nothing in logs | Field allowlist in the logger. Row values are not loggable |
| Nothing in traces | Span attribute allowlist. SQL text is recorded, result values are not |
| No swap, no core dumps | Container configuration |

**The proof:** a query returning 100k rows of known sentinel values, then a scan of the container filesystem and the process's mapped memory. Zero matches, or the slice fails.

## C.6 The bypass suite

Ten named tests. All must fail to reach a base catalog. A newly discovered bypass is added in the same pull request as its fix.

| # | Attempt | Expected |
|---|---|---|
| 1 | `SELECT * FROM pg_warehouse.public.orders` | Object not found |
| 2 | A withheld column via the base catalog | Object not found |
| 3 | `duckdb_databases()`, `duckdb_tables()`, `duckdb_columns()` | Only the pool's objects |
| 4 | `information_schema.tables`, `.columns` | Only the pool's objects |
| 5 | `duckdb_views()` or `SHOW CREATE` exposing a view body | Refused, or bodies redacted |
| 6 | Base reference inside a CTE, subquery or `UNION` | Object not found |
| 7 | Base reference in a prepared statement or `CREATE MACRO` | Refused at parse |
| 8 | `"PG_Warehouse"."public"."orders"` quoted and case-varied | Object not found |
| 9 | `ATTACH` of an already-attached source | `sql_not_permitted` |
| 10 | `SET search_path` toward a base catalog | Refused, and `SET` is refused anyway |

**The suite runs against both execution paths.** A bypass that fails under staging and succeeds under streaming is the failure mode the streaming condition exists to prevent, so every case above is executed twice.

| # | Streaming-specific | Expected |
|---|---|---|
| 11 | Query qualifying for streaming, then a `SELECT *` on an object with a withheld column | Object does not qualify. Staged path taken |
| 12 | Object where one column of fifty is tokenized | Never streams, regardless of which columns the query names |
| 13 | Streaming query joined to a staged object | Whole execution staged |
| 14 | `executionPath` on the record | Present and correct on every run |

---

# D. The tenant isolation wrapper

Row-level security is only as good as the code that sets the session variables. This is that code, and it is the one place where a mistake leaks another customer's metadata.

## D.1 The rule

**Every database access happens inside a scope.** There is no way to obtain a connection outside one. The pool is not exported; only `withTenant` and `withPlatform` are.

```ts
export async function withTenant<T>(
  ctx: { userId: UserId; projectId: ProjectId },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config with is_local = true, so the settings are scoped to this
    // transaction and disappear on COMMIT or ROLLBACK without any cleanup path
    await client.query(
      `SELECT set_config('app.user_id',    $1, true),
              set_config('app.project_id', $2, true)`,
      [ctx.userId, ctx.projectId],
    );
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

**`is_local = true` is the whole design.** Transaction-scoped settings vanish on commit or rollback, so there is no cleanup path that can be missed and no way for a connection to return to the pool carrying another tenant's identity. A `SET` without `LOCAL`, or `set_config` with `false`, is session-scoped and survives release. That is the bug this construction exists to make impossible.

**A release without a commit or rollback is impossible** because both paths run before `finally`.

## D.2 Platform scope

Industry and vocabulary at industry scope are not tenant data. They use a separate wrapper that sets no project and connects as a role with no RLS bypass but with read access to platform tables.

```ts
export async function withPlatform<T>(fn: (tx: Tx) => Promise<T>): Promise<T>

Writing to an industry-scope row uses a third wrapper on a distinct role:

```ts
export async function withPlatformAdmin<T>(
  ctx: { actor: ActorRef },                 // recorded on the audit entry
  fn: (tx: Tx) => Promise<T>,
): Promise<T>
```

It connects as `opintel_platform_admin`, sets no project, and writes an audit
entry for every call. **No route in the customer-facing API reaches it.** A test
asserts that by scanning the call graph from every registered route.
```

Writing to an industry-scope row requires `withPlatformAdmin`, which uses a distinct role. There is no route in the customer-facing API that reaches it.

## D.3 What must never exist

- An exported connection pool
- A repository that takes a client as an argument from outside a scope
- `SET app.project_id` anywhere, as opposed to `set_config(..., true)`
- A query that filters by project in application code **instead of** relying on RLS. Belt and braces is fine; braces alone is not

A lint rule forbids importing the pool module outside `platform/db`, and a test asserts the exports.

## D.4 Tests

| ID | Case | Expected |
|---|---|---|
| RLS-01 | Read a table scoped to project A while in project B's scope | Zero rows, not an error |
| RLS-02 | Insert a row with project A's id while in project B's scope | Rejected by the `WITH CHECK` policy |
| RLS-03 | Connection released after a successful commit, then reused | `app.project_id` is unset |
| RLS-04 | Connection released after a rollback, then reused | `app.project_id` is unset |
| RLS-05 | Exception thrown inside `fn` | Rollback, release, settings gone |
| RLS-06 | 50 concurrent requests across 5 projects on a pool of 10 | No cross-tenant row ever returned |
| RLS-07 | Direct query outside a scope | Compile error. The pool is not importable |
| RLS-08 | Platform read from a tenant scope | Allowed. Industry data is shared |
| RLS-09 | Industry write from a tenant scope | Rejected. Wrong role |
| RLS-10 | Every tenant table | Has RLS enabled and at least one policy. Asserted by scanning `pg_policies` |

Test RLS-10 is the one that matters over time: a new table added without RLS is caught by the test rather than by an incident.

---

# E. Classification and the prompt pipeline

Slice 1 runs the pipeline without fragments, protocols or learning. The stages that do exist are specified here because a generator will otherwise invent thresholds.

## E.1 Stages

```
classify -> recover -> resolve values -> resolve sources -> compose -> validate
         -> qqc L1 -> qqc L2 -> qqc L3 -> execute -> record
```

Each stage takes and returns a context, and any stage may return `continue`, `clarify` or `refuse`. A clarification pauses the run durably: the context is persisted, and the resume arrives as a separate request, possibly minutes later on a different instance.

## E.2 Classification

**Temperature 0. The prompt is versioned and stored, not inlined in code.**

Input: the raw question plus the project's effective vocabulary, rendered as a compact list of canonical names with synonyms.

Output: CIL, validated by a Zod schema. **A malformed CIL is a refusal, never a repair.** Asking the model again with "that was not valid JSON" produces a different answer to the same question, which breaks the determinism the evidence record depends on.

```ts
const Cil = z.object({
  op: z.enum(['aggregate','compare','calculate','rank','lookup','trend']),
  aggregationFunction: z.enum(['avg','max','min','sum','count']).nullable(),
  subject: z.string(),
  metrics: z.array(z.object({
    name: z.string().nullable(),
    parseStatus: z.enum(['complete','unknown','auto_resolved','decomposed']),
    requiredColumns: z.array(z.string()),
    rawExpression: z.string().nullable(),
  })),
  params: z.record(z.string()),
  parseStatus: z.enum(['complete','partial','error']),
  parseConfidence: z.number().min(0).max(1),
});
```

## E.3 Metric recovery

Runs only when a metric came back `unknown`.

```
embed(rawExpression)
search embedding where owner_type='metric' and active
       and (scope='industry' and industry_id = P.industry
            or scope='project' and project_id = P.id)
order by vector <=> query limit 5
```

| Outcome | Condition | Behaviour |
|---|---|---|
| Auto-resolve | top similarity **> 0.85** and gap to second **> 0.15** | Resolve, mark `auto_resolved`, write a synonym candidate, attach a quality warning |
| Clarify | two candidates both **> 0.60** and within **0.15** of each other | Clarification naming both |
| Unresolved | nothing **> 0.60** | Pass downstream as unknown with the candidates as hints. **Never guess** |

Boundaries are strict: exactly 0.85 does not auto-resolve. Thresholds are configuration, not constants, and their values appear in the Workbench trace when recovery fires.

## E.4 Parameter value resolution

Deterministic, no model. For each parameter whose vocabulary entry has a `columnHint`:

```
1. load element_stats.top_values for the hinted column
2. exact match, case-insensitive        -> resolved
3. Levenshtein similarity vs each value:
     > 0.85 and unique                  -> resolved with a substitution warning
     0.60 to 0.85, or several plausible -> CLARIFY with the real values and frequencies
     < 0.60                             -> unresolved; pass available values downstream
4. enum parameters validate against enumValues; a mismatch marks the param partial
```

**This is the only place in the system where string distance is used.** Everything else linguistic is the model reading synonyms, or vector similarity. No regular expressions for intent, metric or parameter recognition.

**Clarifications are built only from observed values.** An option the system has never seen in the data is never offered.

### E.4.1 Levenshtein finds typos, not synonyms

String distance handles `Torono` against `Toronto`. It is useless for `detached` against `single_family`, or `flood` against `FLD_PERIL`, where the strings are unrelated and the meaning is identical. Those are **categorical mappings**, and they are vocabulary, not text processing.

So value resolution runs two lookups and the clarification carries both:

```
1. categorical mapping    the parameter's declared value map, if it has one
                          'detached' -> 'single_family'     exact, deterministic
2. string distance        Levenshtein against top_values     typos only
```

A parameter whose element has an enumerated domain may declare a **value map**, built during the deployment exactly as synonyms are:

```ts
type ValueMap = {
  parameterId: TermId;
  entries: Array<{ spoken: string; value: string }>;  // 'detached' -> 'single_family'
};
```

**The clarification payload carries the provenance of every candidate**, so the interface can show why each is being offered:

```ts
candidates: Array<{
  value: string;
  frequency: number;                 // rows in the column
  via: 'mapping' | 'similarity' | 'frequency';
  spokenAs?: string;                 // the mapped term, when via is 'mapping'
}>
```

A mapped candidate reads as *"single_family, which you call detached, 4,182 rows"*. A similarity candidate reads as *"Toronto, 4,182 rows"*. **The difference matters to the person answering**: one is a vocabulary question, the other is a spelling question, and conflating them produces a confusing list.

**Accepting a similarity match teaches nothing.** Accepting a mapping candidate, or supplying one at a clarification, writes a value map entry and that phrasing resolves exactly thereafter. That is the same demand-signal loop as synonym candidates, applied to values rather than terms.

## E.5 Source resolution, Slice 1

Slice 1 has no source-of-truth registry, so resolution is matching only:

```
1. exact column name match across bound sources
2. description match
3. one clear winner -> use it, record resolvedVia: 'inferred'
4. several plausible -> CLARIFY naming the candidates
```

**Join resolution:** declared foreign keys first, then column-name equality between a key and a same-named column. **Two candidate paths of equal standing refuse and name both.** Picking one produces a defensible-looking number that is wrong, which is the worst failure this product can have.

Where Slice 3 adds the registry, step 0 becomes a registry lookup that short-circuits everything above it.

## E.6 Quality control

**L1 structural**, deterministic: no DDL or DML, every referenced column exists in the resolved plan, no source outside the plan. A violation is a scope violation and is recorded as one.

**L2 cardinality**, deterministic: estimate from table statistics and join fan-out, band as safe, large or huge. Above the project's threshold, default 50,000, require confirmation before executing.

**L3 semantic**, temperature 0: does the SQL answer the CIL, does the aggregation match the intent, is a computed formula dimensionally sane, is the declared join present and fan-out mitigated. Verdict is `approve`, `approve_with_warning` or `rewrite`. A `rewrite` returns to composition once; a second `rewrite` refuses.

**L3 is the defence against the failure that matters most here: a fluent, plausible, wrong answer.** Everything else in the pipeline fails visibly. That one does not.

### E.6.1 L3 is the highest-risk component in the system

Every other control is deterministic. L1 is a specification chain, L2 is arithmetic over statistics, the entitlement model is compiled SQL, the isolation is a process boundary. **L3 is a language model deciding whether a query means what was asked**, and if it approves a dimensionally insane formula the system fails silently and the record records a wrong answer as correct.

A single-model check with no regression suite is not a control. It is a hope with a temperature setting.

### E.6.2 The L3 corpus

A fixed corpus of SQL and CIL pairs with known verdicts. **It runs in CI on every change to the prompt, the model pin, or the composition stage**, and it is the direct analogue of the bypass suite in C.6.

| Class | Example | Required verdict |
|---|---|---|
| **Dimensional nonsense** | `SUM(premium) / SUM(policy_count)` labelled as a rate when the metric is a ratio of amounts | rewrite |
| **Wrong aggregation** | CIL says `max`, SQL computes `avg` | rewrite |
| **Grain violation** | `AVG(a/b)` where the metric declares sum over sum | rewrite |
| **Silent join change** | The composed SQL uses a different join path from the resolved plan | rewrite |
| **Unmitigated fan-out** | Many-to-many join with no aggregation before it, inflating the total | rewrite |
| **Period mismatch** | CIL says last 30 days, SQL filters on the wrong column | rewrite |
| **Dropped predicate** | A parameter resolved in CIL is absent from the `WHERE` | rewrite |
| **Added predicate** | The SQL filters on something the question never asked for | rewrite |
| **Correct, unusual shape** | A valid query written in an idiom the model may not recognise | approve |
| **Correct with a genuine caveat** | Calendar days where business days were plausible | approve with warning |

**The last two matter as much as the first eight.** A validator that refuses everything is as useless as one that approves everything, and false refusals are how a safety layer gets switched off in production.

### E.6.3 Gates

| Gate | Threshold |
|---|---|
| Known-bad cases caught | **100%.** A single miss fails the build |
| Known-good cases approved | At least 95%. Below that the validator is too aggressive to keep |
| Determinism | Ten runs of the corpus produce identical verdicts |
| Regression on model change | The corpus runs before any model pin is updated. A model that fails it is not adopted |

**The corpus grows from production.** Every wrong answer that reaches a customer and was approved by L3 is added to it in the same pull request as its fix, exactly as a newly discovered bypass is added to C.6.

### E.6.4 What happens when L3 is unavailable

The model provider is a dependency, and it fails. **Composition refuses rather than executing unvalidated**, and the refusal says so plainly: the query could not be checked, not that the query was wrong.

Skipping L3 under load would mean the safety check disappears exactly when the system is busiest, which is the wrong direction. Prompt mode degrades; query mode is unaffected because it never touches L3.

## E.7 Tests

| ID | Case | Expected |
|---|---|---|
| CLS-01 | Same prompt, same vocabulary version, 10 runs | Identical CIL |
| CLS-02 | Metric written as a known synonym | Normalises to the canonical name |
| CLS-03 | Unknown metric | Preserved verbatim, marked unknown |
| CLS-04 | Malformed CIL from the model | Refusal, not a repair, not a partial answer |
| CLS-05 | Recovery at exactly 0.85 | Does not auto-resolve |
| CLS-06 | Recovery with a 0.15 gap exactly | Does not auto-resolve |
| CLS-07 | Recovery scope | Never returns another project's or another industry's metrics |
| CLS-08 | Parameter typo | Clarification with real values and real frequencies |
| CLS-09 | Clarification options | Every option exists in `top_values` |
| CLS-10 | Clarification resumed after an API restart | Completes correctly |
| CLS-11 | Two equal join paths | Refused, both named |
| CLS-12 | No join path | `sources_cannot_be_joined` |
| CLS-13 | Measure with no grain rule | Composition refused |
| CLS-14 | L1 with an out-of-plan source | Blocked, scope violation recorded |
| CLS-15 | L2 above the threshold | Confirmation required, does not execute |
| CLS-16 | L3 rewrite twice | Refuses on the second |
| CLS-17 | Every stage | Appends a `run_stage` row with its result and duration |
| CLS-18 | Categorical mapping present | `detached` resolves to `single_family` exactly, no clarification |
| CLS-19 | Clarification candidates | Each carries `via`, and mapped candidates carry `spokenAs` |
| CLS-20 | Value map written at a clarification | The same phrasing resolves exactly thereafter |
| CLS-21 | **L3 corpus, known-bad cases** | **100% caught. One miss fails the build** |
| CLS-22 | L3 corpus, known-good cases | At least 95% approved |
| CLS-23 | L3 corpus determinism | Ten runs, identical verdicts |
| CLS-24 | Model pin changed | Corpus runs first. A failing model is not adopted |
| CLS-25 | L3 provider unavailable | Composition refuses, stating the query could not be checked |
| CLS-26 | Query mode while L3 is unavailable | Unaffected |

## E.8 Clarification: batching and policy

Written after the rest of section E, and it changes stage behaviour, so it governs where it conflicts with anything above.

**Resolution completes for every concept before any clarification is raised.** A prompt with three ambiguities produces one clarification with three items, not three sequential round trips. Sequential asking is a defect, not a degraded experience: it triples latency and makes an interactive session feel like an interrogation.

```ts
type ClarificationRequest = {
  runId: RunId;
  items: Array<{
    concept: string;
    kind: 'parameter_value' | 'metric' | 'source' | 'join_path';
    candidates: Array<{ value: string; frequency?: number; detail?: string }>;
    saveAsDefaultAvailable: boolean;
  }>;
};
```

**Policy is per pool**, because the caller determines whether anyone can answer.

| Value | Behaviour | For |
|---|---|---|
| `pause` (default) | The run pauses durably and waits for `respond_clarification` | An assistant with a person present |
| `refuse` | Returns `clarification_required` immediately, naming every ambiguity and its candidates | Scheduled and unattended callers |

A scheduled pipeline at 02:00 cannot answer, and an autonomous agent choosing between two options it knows nothing about is guessing with extra steps. **A refusal under this policy is a request for configuration, not a failure to answer**, and the response says so.

The policy in force is recorded on every run, so a record explains why a request refused rather than paused.

**Save as default** is offered on every item that can be remembered. Accepting writes a project-scope term or a registry entry, and that concept never asks again. This is the mechanism that converts interactive use into unattended reliability, and it is why a six week deployment produces a system a pipeline can run against.

| ID | Case | Expected |
|---|---|---|
| CLR-01 | Pool set to `refuse`, ambiguous prompt | Immediate `clarification_required` naming every ambiguity |
| CLR-02 | Pool set to `pause`, ambiguous prompt | Durable pause, resumable |
| CLR-03 | Three ambiguities in one prompt | **One** clarification with three items |
| CLR-04 | Save as default accepted | Term or registry entry written; the identical prompt does not ask again |
| CLR-05 | Policy recorded | Every run states which policy applied |
