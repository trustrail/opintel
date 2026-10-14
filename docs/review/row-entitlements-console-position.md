# Design position: row entitlements, editing and scale

Status: **5.37 step 2b ready for implementation.** The seven readiness decisions below are resolved. This update is documentation only; implementation starts on a separate prompt. This extends the [row-scoping position](row-scoping-design-position.md); step 2's comparison, read-boundary, disclosure and immutable-receipt contracts remain binding.

## Starting point

Step 1 implemented pools as groups of independently rotating credentials with permanent custody aliases. Step 2 implemented static object × pool row decisions, a grammar editor, read-boundary enforcement and receipt facts. Migration 074 stores immutable decisions with object, required pool, expression, AST, normalised hash, referenced columns, actor and time. There is no object default, tag rule, builder or privileged preview today. A scoped object without a decision for the caller's pool currently returns zero rows and raises the missing-scope finding.

## Decision model

| Level | Target and meaning | Step 2b |
|---|---|---|
| Project rule by tag | Objects with a column tagged `<tag>` inherit a predicate template naming the tag rather than a physical column. The catalogue binds it per object. Examples supplied for the model are `<customer> in scope(customer)` and `region <customer-region> = 'EU'`. Record actor and time as a decision. | Design model, storage and precedence now; do not implement tag-rule editing or execution |
| Object default | One row filter for an object, applying to every pool | Build |
| Pool override | One row filter for a pool on an object; existing step 2 decisions become overrides | Build |

Composition is conjunction, not replacement: **effective filter = tag rule AND object default AND pool override**, including every level that exists. A pool override cannot widen the default because the default continues to apply. This corrects the earlier “replaces the default” wording. No implication proof is required. **Reason: authorization widens only by removing a rule, never by adding one.**

Resolve at architecture step **3**, in this order:

1. Determine whether the object has any row decision at any level, including decisions for other pools.
2. If it has none, it is unscoped and unchanged.
3. Otherwise compose all applicable tag rules, the object default and the caller pool's override.
4. If this scoped object has no effective filter for that pool, return zero rows, record the Activity mark and raise the existing Needs You item. An empty set of applicable decisions is not an unscoped read.
5. Apply the effective predicate before treatments under the existing read-boundary contract. Step **3a** remains reserved for scope lookup.

The receipt names every contributing decision and one hash of the normalised effective predicate. A default continues to contribute when an override exists. Historical decisions remain immutable.

### Storage contract to design before implementation

Use a project-scoped decision model with an explicit level (`tag_rule`, `object_default`, `pool_override`) and level-specific target: tag reference, object, or object plus pool. Retain immutable identity, actor, time, grammar text, AST, normalised hash and referenced inputs. Reserve template/tag-reference representation now so enabling tag rules later does not require a new decision-storage migration. Tags are catalogue column attributes, one tag per column per domain. Reuse the existing column classification mechanism if it supports this contract; otherwise add the attribute. Vocabulary supplies matching suggestions, not the binding authority. Specify the binding now; tag-rule editing and execution remain future work.

A new forward migration is required for step 2b; migration 074 remains unchanged. Existing decisions become pool overrides without changing their ids, expressions, history or historical receipts. Preserve decision history for the default shown when an override was written. The pool editor shows the default read-only above the additional predicate and previews their combined effect. Explicit widening is refused in 2b; no removal of a default through a pool override is supported. The no-later-migration requirement applies to adding tag rules, not to avoiding this forward migration.

Receipt storage must accommodate several contributing decision ids while continuing to read step 2's single-decision receipts. Historical receipts are never rewritten. Predicate literals stay in authorised console decision history, never in receipts; retain referenced column names and the effective hash. Unscoped receipt data remains absent, Activity summaries remain quiet, and expanded metadata retains “Rows: unscoped at the time of the call”.

## Editor and preview

The builder is the default tab. Each clause has a catalogue display-name column with its type, operators limited by that type, and a typed value editor. AND/OR groups show explicit parentheses. Only when a project has declared scope domains may a bound column offer **the agent's <domain>** as a value choice. Those domains arrive in step 3a: 2b offers no scope-reference choice or placeholder UI. The grammar text is the second tab; both views round-trip through the same AST, with grammar text as the stored form. Preserve step 2's NULL, text, exact-number and time semantics and validation messages. The text view continues to parse and refuse scope references with “scope references arrive in step 3”.

Before save, preview runs the proposed predicate through the Engine's real read path for the chosen pool. It returns the entitled-row count out of the total and up to five sample rows with that pool's column treatments applied. This is a privileged read, recorded as evidence. Zero entitled rows warns before save. The total is a preview-only requirement, not permission to put table totals into agent receipts. Only the role permitted to decide entitlements may preview. Record actor, object, pool, predicate hash and time as evidence. Counts are exact, not estimates. After applying the effective predicate, order by the object's primary key, or by all columns in catalogue order if it has no primary key, and take the first five. Withheld columns are absent and tokenized values are tokenized. Custody preview values are sealed, labelled “released under custody (sealed in preview)”, without a grant, escrow call or redemption. Preview selects a pool, never a credential. For an object whose columns are aggregate-only for the pool, show only the exact entitled-row count out of the total and list the columns that would be returned as aggregates. Execute no aggregate functions and return no sample rows. Below the disclosure threshold, show “below the disclosure threshold” instead of the entitled count.

The object card shows the default and each pool's status: inherited, overridden or unscoped. Its default editor edits the object-level decision. The pool card lists the objects it is scoped on and the contributing level; its override editor shows “inherits from object” when applicable, the default read-only above the override, and the additional restriction separately. Preview shows the combined effect, not a replacement.

The receipt's rows line links to contributing historical decisions rendered in the builder's words, never only a hash. Decision text is resolved through authorised console history; linking does not expose literals to an agent or grant a reader new permissions. The receipt must remain explainable after later edits or removals.

The Needs You item remains the existing missing-scope finding. The exposure bar remains column-based and unchanged. Migrating existing per-pool decisions to overrides preserves the resolution order above and therefore the existing missing-pool refusal.

## Scale: record only

- Project tag rules use the model above; their editing and execution are later work. Template syntax and binding execution are part of that future work, not a new parser in 2b.
- **Future item — pool exemption decision (not designed):** a recorded reason and a second approver would allow removal of the object default for one pool. This is not an override and is not available in 2b. Until then a pool needing unrestricted rows must use an object with no default and no tag rule; it cannot widen either through an override.
- Issuer claims and groups supply scopes through 5.39.
- Customer-system-derived scope grants belong to 5.38.
- A project-level **what can this agent see** simulation across all objects generalises the preview; it is not built in step 2b.

## Planned proof

- Composition: all existing levels are conjoined, the default remains effective under an override and after a default change, and the tag floor remains effective. Explicit widening is refused. Missing-pool scoped objects return zero; only objects with no row decisions are unscoped.
- Migration preserves existing decision identity/history and the decided missing-pool behavior.
- Builder ↔ text round-trip preserves the AST and effective hash, including grouping and typed values; reserved scope terms retain the step 2 save refusal and invalid expressions retain grammar messages.
- Preview entitled count equals a real call's count for the same pool, predicate and source snapshot; treatments and disclosure thresholds still apply, preview produces evidence, and zero rows warns.
- Receipt names every contributing decision with one effective hash, no literals or table totals, and resolves historical explanations after subsequent decisions.
- Browser scenarios at **390 / 900 / 1440**: builder valid and grammar-refused states; preview panel; inherited versus overridden object/pool states; receipt link. Assert no scope-reference choice before declared domains exist, and the text refusal remains. The enabled scope-reference scenario belongs to step 3a.

## Readiness decisions — resolved

1. **Composition, not replacement.** Conjoin tag rule, object default and pool override wherever present. The editor shows the default read-only and previews the combined effect; receipts name all contributors. **Reason:** narrowing is true by construction, without an implication prover or a replacement that silently widens access.
2. **No explicit widening in 2b.** Refuse an unscoped override or any attempt to remove the default for a pool. A pool needing everything uses an object with no default and no tag rule. Record the future exemption item above, requiring a reason and second approver, without designing it. **Reason:** a narrowing edit and an authorised widening are different decisions; a reason alone cannot turn one into the other.
3. **Fail-closed preserved.** Any row decision at any level makes the object scoped. No applicable filter for a caller pool then means zero rows, Activity mark and Needs You; only no decisions anywhere means unscoped. **Reason:** introducing inheritance must not grant access to pools previously refused, including during migration from step 2.
4. **Catalogue tag binding.** A tag is a column catalogue attribute, set from the column's console row, one tag per column per domain. Offer matching Vocabulary terms as suggestions. Reuse column classification if suitable, otherwise add the attribute. Tag rules remain future; only the binding contract is specified now so 2b's storage accommodates them without a later migration. **Reason:** the catalogue binds a template to an actual column; vocabulary assistance must not become a separate authority for that binding.
5. **Scope choices follow declared domains.** Offer them only when project scope domains exist. Before step 3a the builder offers none, with no placeholder; the text view retains step 2's refusal. **Reason:** an editor must not offer a scope capability the runtime cannot execute.
6. **Deterministic, exact preview.** Apply the effective filter, order by primary key or all columns in catalogue order when there is no key, and take the first five. Counts are exact. **Reason:** comparable previews require a defined order and the real entitled count, not source arrival order or an estimate.
7. **Privileged preview with real treatments.** Only the entitlement-deciding role may preview; each preview records actor, object, pool, predicate hash and time as evidence. Samples omit withheld values, tokenize tokenized values and show sealed custody values without a grant. Aggregate-only objects show the exact entitled count out of the total and the names of aggregate columns, never sample rows or computed aggregates; suppress the entitled count below the disclosure threshold. **Reason:** administrative preview is an accountable privileged read, not a bypass of the chosen pool's treatments or aggregate disclosure controls.

**Step 2b is ready.** The tag-rule implementation, exemption decision, scope references and project-wide simulation remain later work. No code is part of this decision update.

## Preview refinements — decided

8. **No custody grant in preview.** Preview has no recipient and takes a pool only. Custody columns display sealed values with the label **released under custody (sealed in preview)**. No release grant is issued, no provider escrow is called and nothing is redeemable. **Reason:** an administrator inspecting a pool's treatment is not a credential recipient; preview must not create a release capability or require choosing an agent identity.
9. **Aggregate-only preview is count only.** For an object whose columns are aggregate-only for the pool, display the exact entitled-row count out of the total and list the columns that would be returned as aggregates. Execute no aggregate functions and return no samples. If the entitled count is below the disclosure threshold, display **below the disclosure threshold**, not the number. **Reason:** treatments do not define an aggregate query; preview should establish scope without inventing functions or bypassing the disclosure threshold.

### Preview boundary — decided; supersedes Application sealing

The internal Engine preview operation is reachable only from the Application preview endpoint authorised for the entitlement-deciding role. It is not an MCP tool, is not described to agents, and cannot be invoked with a pool credential. It applies the same effective filter and treatments as an ordinary call and returns only exact counts and at most five treated samples; no untreated value or out-of-scope row leaves the Engine. Ordering by primary key, or all columns in catalogue order, occurs at the source boundary before treatments. Ordering inputs are not returned unless permitted by the pool's treatments. Every invocation records actor, object, pool, predicate hash and time as evidence. Conformance must establish that preview samples are a subset of the same pool's ordinary results, treatment for treatment.

**Preview custody sealing occurs in the Engine at the read boundary**, with a temporary key generated and destroyed there. The response contains ciphertext; no grant, provider escrow, persisted share or credential selection exists. This supersedes the earlier Application-sealing approval. **Reason:** the architecture places sealing in the Engine, and preview should be the first path that matches it, rather than a second path that does not. The no-untreated-value fence applies to the Engine response, not merely the Application response. Ordinary query enforcement and real-call sealing remain unchanged in 2b; their architecture discrepancy stays separately deferred.

## Decision: pool row access lists decisions, never the catalogue

The pool page opens Row access with one summary line: **N missing filters · M overrides · K inherit a default · J no row filter**. The first three counts filter decisions here; **no row filter** links to the Entitlements catalogue with the same pool selected, Everything / By table, filtered to objects with no row decision at any level. Default view is this
pool's overrides only. Search by object name appears only when the selected decision view has at least one decision (and remains available if its search matches none). Each decision row names its
object and source, the override in builder words, a cached preview count if one
exists, and the actor/time of the last decision. Never run previews merely to
populate the list. When the project has object defaults and this pool has no overrides, the empty state remains **No overrides. This pool follows each object's default.** When no active object in the project has a default, show **No object in this project has a row filter yet. Set a default in Entitlements, or add an override here to filter for this pool only.** Entitlements is a link to the catalogue. Both variants offer **Add override**.

Beside the chips, show: **Row filters are set once per object in Entitlements as a default; an override here narrows that default for this pool only.**

Add override opens a searchable object picker grouped by source, not an inline
catalogue. Choosing an object opens the override editor with its default
read-only above it when one exists. Objects without a default are included and labelled **no default** in the shared picker. Selecting one opens the same override-only editor; saving creates a pool override with no parent default. Composition is that override alone. Other pools without an effective predicate still fail closed. Inherited defaults are available only through their filter,
paginated, read-only here, with a link to the object card. Objects with no row filter are never listed on the pool page. Lists exceeding 50 rows are paginated or
virtualised; no page renders the whole catalogue. On the object card, show
overridden pools first; inherited pools collapse into a count with expansion,
never a default row for every pool. Existing filter composition and fail-closed
semantics are unchanged.

Required browser scenarios at 390/900/1440: zero overrides; three overrides;
inherited filter over 200 objects; the object picker; an object with two
overridden and twenty inherited pools. The reason is operational scale: this
page is for reviewing a pool's decisions, not browsing every catalogue object.

The four states are ordered: **missing filters, overrides, inherited defaults,
no row filter**. Missing means a scoped object with no effective filter for this pool;
it returns zero rows, never an unscoped read. Its chip uses the existing attention
treatment, exposes those rows with Add override directly, and links to Needs You.
The no-row-filter count navigates to Entitlements; it never opens a catalogue list on the pool page. Console configuration copy uses **no row filter**; the API and historical receipt vocabulary remain unchanged.

**Shared picker — decided.** Build one shared object picker using the existing
modal, search and row patterns, grouped by source with cursor pagination and
single/multi selection selected by a prop. Add override uses single selection.
The bulk bar adopts this same component when it next changes; no page-specific
picker is permitted. Document it in the visual language. A pool override editor
cannot switch to editing the object default; it shows the default read-only.

Additional review scenario at each viewport: missing-filter attention chip and
its direct Add override rows. Counts are exclusive and cover active objects
bound to this pool; search filters rows, not the summary counts. Preview counts
are shown only when already cached for the current decision, never by issuing
reads to populate the list.


### Discovery correction — Rick review, 2026-10-13

Required additional review captures at 390/900/1440: eleven objects with no row filters and no overrides; shared picker showing a no-default object; saved override on that object, with no parent default. Existing zero-override/inherited-default, three-override, missing-filter, inherited pagination and object inheritance scenarios remain. Review artifacts are indexed in `tmp/review/row-access-index.html`. No baseline regeneration or full gate before Rick approves.


Discovery correction verification: strict typecheck and lint passed. Seventeen focused normal tests passed (pool row access, predicate composition and entitlement reads). Twenty-two affected functional browser cases passed at 390/900/1440 with axe, navigation/placement and control-conformance checks; after keeping search controls mounted during fetches, all twelve Row access cases passed again, including continuous typing and the filtered catalogue destination. Both browser runs reported zero conformance findings with partial route coverage. The final run refreshed all thirty indexed review captures. Existing single-contributor composition already treats a missing default correctly; the new real query-path regression verifies rows and the sole receipt contributor without changing predicate enforcement. Logs: `tmp/row-discovery-tests.log`, `tmp/row-discovery-browser.log`, `tmp/row-discovery-browser-final.log`, `tmp/row-discovery-typecheck.log`, `tmp/row-discovery-lint.log`. No gate, baseline update or commit. Awaiting Rick's design review.


### Agents table credential provenance — decided

Label by the last authentication. If `lastSeen` is **before migration 072's recorded application time**, display **pool key (legacy)** with no credential label or alias. At or after that timestamp, display the authenticated key version's credential label and alias, including a preserved retiring-key alias. **Reason:** 072 turned existing keys into credentials, so an authentication after 072 with that key is an authentication with the credential; one before it was not. Equality belongs to the credentialed side.

No new presence column is needed: the recorded key version plus the 072 timestamp determines this. The timestamp comparison uses PostgreSQL precision. Migration 078 exposes only this comparison through a fixed-search-path function executable by the application role; the migration ledger remains owner-only. It does not backfill or modify presence or evidence.

On the pool page, the Agents table adds **Credential** beside Agent, with the credential label and a truncated alias; hover and keyboard/touch expansion reveal the full alias. Footer: **Agents are identified by the credential they present; the alias on the receipt is that credential’s. Names in the Client column are self-declared.** Agent IDs remain observational and never authorize access.

Review captures at 390/900/1440 show one credentialed agent and one legacy agent, plus expanded aliases. No baselines or commit before review.


Agents correction verification: 16 focused tests passed, including the before/at/after cutoff unit cases at microsecond precision, revoked-key attribution, presence regressions, migration up/down/up and ledger isolation. Strict typecheck and lint passed. All 25 selected functional browser cases passed; axe, navigation/placement and partial control-conformance checks reported no findings. The 36 linked review captures include collapsed and expanded aliases at 390/900/1440 and refreshed Row access scenarios. Migration 078 is applied to the local test and development databases. Logs: `tmp/agent-credential-tests.log`, `tmp/agent-credential-typecheck.log`, `tmp/agent-credential-lint.log`, `tmp/agent-credential-browser.log`. No full gate, baseline update or commit. Stopped for Rick's review.

### Approved design; baseline reproducibility blocked — 2026-10-14

Rick approved the design. The single authorized regeneration pass updated pool detail and shown-once at 390/900/1440, and added 36 snapshots for the new Row access and agent credential scenarios: 42 images total. All 18 selected browser scenarios passed during generation. The new scenarios now participate in the visual project and retain their functional and accessibility assertions.

The required unchanged-code recapture in the same pinned browser, with retries disabled and a zero-pixel matcher threshold, completed with 17 scenarios passing and one failing. The matcher reported 67 differing pixels in `override-created-no-default-1440.png`. Independent RGBA comparison, including antialiased pixels, found 40/42 images exact. Two same-size images differed: `override-created-no-default-1440.png` by 154 pixels in the drawer chevron/Work text (x=26–233, y=34–340), and the post-matcher capture of `picker-no-default-object-1440.png` by 1,737 pixels in breadcrumb text behind the picker (x=277–620, y=36–48). This is a capture reproducibility defect; the underlying cause is not established and no environmental explanation is claimed.

Evidence: `tmp/pool-approval/regeneration.log`, `tmp/pool-approval/reproduction.log`, `tmp/pool-approval/pixel-proof.json`, and the failure images under `tmp/pool-approval/results/`. The unchanged revoke-dialog baselines are outside the authorized regeneration list; diagnostic captures show differences in the approved Row access background, starting at y=772/702/624 for 390/900/1440 respectively.

AGENTS.md requires zero differing pixels before committing regenerated baselines. The candidate therefore remains uncommitted and unpushed. No second regeneration or recapture, `check`, or `check:ui` was run. The requested post-commit gate sequence remains pending; no gate result is claimed.

### Capture diagnosis and exact reproduction — 2026-10-14

The reader authorized five further unchanged-tree captures of each failing scenario, diagnosis and correction, then one regeneration and one recapture, stopping before commit. This supersedes the preceding capture stop; it does not authorize a gate or commit.

The two images are **override-created-no-default-1440.png** (saved override with no parent default) and **picker-no-default-object-1440.png** (shared picker listing objects with no default). Original exact diffs are retained in `tmp/pool-diagnosis/original/`, with `-diff.png` suffixes. The former differs in the drawer collapse chevron and Work label, x26–233/y34–340, by 154 RGBA pixels. The latter differs only in breadcrumb glyphs behind the picker, x277–620/y36–48, by 1,737 pixels. The original captures did not retain DOM text, so its identity cannot be proved retrospectively. All five new captures have identical DOM text, font state and measured component geometry for each scenario; the text and geometry also remain identical across the five before/five after groups.

Unchanged-tree pairwise pixel differences, with captures numbered 1–5:

```text
Saved override                 No-default picker
      1   2   3   4   5              1 2 3 4 5
1     0 154 317 317 317         1    0 0 0 0 0
2   154   0 163 163 163         2    0 0 0 0 0
3   317 163   0   0   0         3    0 0 0 0 0
4   317 163   0   0   0         4    0 0 0 0 0
5   317 163   0   0   0         5    0 0 0 0 0
```

The additional override variance is in the drawer's Manage label, extending to y717. The picker variance did not recur in these five runs. Across all ten pairs per scenario, **Row access, Agents and timestamp regions each contain zero differing pixels**. There is no inherited-list window in either failing state. This rules out inherited-row measurement, credential-alias truncation and relative-time content as causes of these differences, based on the regions rather than an assumption about their implementation. Fonts were already loaded, with no pending font faces; animations were zero. No data, ordering or measured layout variation was observed.

**Cause and fix.** The reproducible defect is capture paint-state dependence after screen transitions: settled fonts/layout and a stable screenshot matcher still retained different glyph rasters. A clean repaint eliminated the observed variation while preserving text and geometry. This identifies the capture phase that was missing; it does not establish a particular Chromium cache implementation. The historical picker mismatch has the same glyph-only signature but was not independently reproduced, so its internal trigger remains unproven.

`e2e/capture.ts` now invalidates paint after the existing font, animation, data and scroll preconditions: it briefly sets root visibility hidden, forces style resolution and restores the exact original inline visibility and priority within the same JavaScript turn, then waits two animation frames. There is no hidden frame in the capture. Focus preservation is asserted, and DOM text is attached to capture metadata. No product styling, font, virtualiser, alias component, tolerance, retry or deadline changed. A five-run control with a full repaint, followed by five runs of the final same-turn/focus-preserving precondition, produced zero pairwise differences for both scenarios. All ten before/after DOM and geometry records agree. The final five-capture matrix is identical for each scenario:

```text
    1 2 3 4 5
1   0 0 0 0 0
2   0 0 0 0 0
3   0 0 0 0 0
4   0 0 0 0 0
5   0 0 0 0 0
```

The single regeneration pass passed 18/18 scenarios (2.6 minutes). Exact generation inspection found one old 390px saved-override baseline that the matcher left unchanged despite ten antialiased pixels differing at x72–73/y35–40. Its actual PNG from that same generation pass became the candidate; no additional capture was made. The single unchanged-code recapture passed 18/18 (2.5 minutes), with updates and retries disabled. Independent decoded-RGBA comparison proves **42/42 exact**, equal dimensions, identical DOM text, and unchanged candidate baseline files during recapture:

| Scenario | 390 | 900 | 1440 |
|---|---:|---:|---:|
| agents-credential-and-legacy | 0 | 0 | 0 |
| agents-credential-expanded | 0 | 0 | 0 |
| object-two-overridden-twenty-inherited | 0 | 0 | 0 |
| override-created-no-default | 0 | 0 | 0 |
| override-no-default-editor | 0 | 0 | 0 |
| picker-no-default-object | 0 | 0 | 0 |
| pool-detail | 0 | 0 | 0 |
| pool-row-all-unscoped-empty | 0 | 0 | 0 |
| pool-row-empty | 0 | 0 | 0 |
| pool-row-inherited-200 | 0 | 0 | 0 |
| pool-row-missing-filters | 0 | 0 | 0 |
| pool-row-three-overrides | 0 | 0 | 0 |
| shared-object-picker | 0 | 0 | 0 |
| shown-once | 0 | 0 | 0 |

Evidence index: `tmp/pool-proof/index.html`; final matrix: `tmp/pool-proof/final-matrix.json`; pairwise and region proofs: `tmp/pool-diagnosis/report.json`, `flush-report.json`, `region-proof.json`. Generation/recapture logs and preserved PNG/DOM records are under `tmp/pool-proof/`. Lint passed. The conformance typecheck reported three existing missing-`custody` errors at `e2e/dashboard-fixture.ts:9–10`; that fixture and its API schema are unchanged. No capture-helper type error was reported. This is not a green conformance typecheck or a gate result. No gate, commit or push was run. Stopped before commit for review.
