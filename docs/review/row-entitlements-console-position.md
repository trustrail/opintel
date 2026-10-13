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
