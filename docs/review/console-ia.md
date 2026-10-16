# Console information architecture — Stage 1

Status: Stage 1 approved by Rick with the additions below; Stage 2 is now authorized. Documentation only; no product, route, style or baseline changes. Stage 2 and Stage 3 require separate review stops.

Audit baseline: `b1da401`, current `src/app/router.tsx`, `navigation.ts`, and the screen, panel and state modules listed below. Counts are source-derived interaction traces, not a browser usability study. Proposed counts are acceptance budgets to verify in the prototype, not measured results.

## Scope and evidence

This proposal reorganises existing capabilities and the explicitly commissioned `/next` navigation. Row defaults, pool overrides, preview and historical contributors already exist (5.37 step 2b). Scope references are the recorded step 3a dependency, not a capability assumed available now. The implementation plan contains older “not implemented” descriptions; its later step records and the implemented screens take precedence for this inventory.

“Connect a source and tag it” means connect, introspect, then confirm or correct Vocabulary-suggested **column scope tags**, through the existing binding mechanism. There is no source-level metadata tag and this flow needs no new API. The current response supplies suggested tag terms, not a complete inferred domain/tag assignment: the administrator supplies the domain, chooses or corrects the term, and saves each column. Do not present a suggestion as an already applied binding. Tags do not themselves change row access; project tag rules remain future.

Source references:

- [Router](../../src/app/router.tsx), [navigation](../../src/app/navigation.ts), [shell](../../src/app/shell.tsx).
- [Plan](../implementation-plan.md), [technical navigation §5.5](../slice1-technical-documentation.md), [row position](row-entitlements-console-position.md), [row scoping design](row-scoping-design-position.md).
- [Sources](../../src/app/sources/screen.tsx), [catalogue](../../src/app/catalog/screen.tsx), [column tags](../../src/app/catalog/column-tags.tsx), [declarations](../../src/app/catalog/declaration-panel.tsx).
- [Decisions](../../src/app/entitlements/screen.tsx), [groups](../../src/app/entitlements/grouped.tsx), [tree](../../src/app/entitlements/table.tsx), [bulk bar](../../src/app/entitlements/decision-bar.tsx), [row editor](../../src/app/entitlements/row-editor.tsx), [builder](../../src/app/entitlements/predicate-builder.tsx).
- [Pools and dialogs](../../src/app/pools/screens.tsx), [row access](../../src/app/pools/row-entitlements.tsx), [credential display](../../src/app/pools/agent-credential.tsx).
- [Activity](../../src/app/activity/screens.tsx), [receipt details](../../src/app/activity/detail.tsx), [suggestions](../../src/app/relationships/screen.tsx), [observations/filings](../../src/app/filings/screens.tsx), [introspection](../../src/app/introspection/screens.tsx).
- [Settings](../../src/app/settings/screens.tsx), [custody status](../../src/app/settings/custody-status.tsx), [Engines](../../src/app/engines/screen.tsx), [Token key](../../src/app/custody/screen.tsx), [Access](../../src/app/access/screen.tsx).
- [Dashboard](../../src/app/dashboard/screen.tsx), [tenancy](../../src/app/tenancy/screens.tsx), [authentication](../../src/app/auth-screens.tsx).

## Five nouns, six destinations

| Noun | Meaning and boundary |
|---|---|
| Source | A connection to customer data, its Engine, introspection and landing provenance. Queries run against the source in place. Spreadsheet ingest lands files into the customer's own database, inside their environment. |
| Object | A table or view and its member columns, types, declarations and scope tags. A column is a member of an Object, not another top-level destination. |
| Pool | A membership boundary containing independently rotating credentials. An agent's self-declared name is presence evidence, never authority. |
| Decision | What a Pool can receive from an Object: column treatments, applicable row predicates and release under custody. An object default is a Decision before a particular pool is selected. |
| Receipt | Immutable evidence of a request, its decisions, delivery and custody events. Missing detail is not evidence of no activity. Revocation prevents unredeemed access; it does not recall delivered data. |

Navigation model: **six destinations, list with adjacent detail, history Back**. Destinations are Home, Sources, Pools, Decisions, Activity, Settings. Wide layouts keep the launching list beside its detail. Narrow layouts show the selected detail in the same destination and preserve the list state. The header has a labelled Back action; history returns to the actual launching screen, with the natural parent as fallback. No breadcrumb is proposed for `/next`. This explicitly supersedes the current §5.5 breadcrumb-only rule for the reviewed prototype; existing screens and their rule remain unchanged.

| Destination | Noun or relationship | Contents and boundary |
|---|---|---|
| Home | Exception: a project orientation index is justified because it directs an administrator to the Source, Pool or Receipt needing action. | Source selection; coverage only where supported by recorded data; actionable notices; compact pool rows; today's available counts. No second presentation of the same fact on this screen. |
| Sources | Source ↔ Object | Sources, Schema and Suggestions views. Connection and introspection stay with their source; declarations and tags stay with their object. Suggestions relate two Objects and explain the resulting Decision. |
| Pools | Pool ↔ Decision | Pool list and adjacent detail: credentials, observed agents, one row per row-access decision/object in the selected view. The pool page lists decisions, not the catalogue. The bounded shared picker finds an object when adding an override. |
| Decisions | Object ↔ Pool | Columns / Rows. Columns grouped By name / By table, explicit member selection and treatment. Rows use the object picker, default/override composition, preview, Builder / Text and immutable history. |
| Activity | Receipt ↔ Decision | Filtered requests with selected receipt alongside; release events and revocation belong to that receipt. Historical decision links preserve historical identity. |
| Settings | Exception: configuration and administration make the five nouns operable without becoming another data model. | Six existing tabs (Project, Query, Discovery, Evidence, Agents and keys, Engines), plus Users and Token key. Users initially preserves the existing read-only access inspection. |

Global project/company selection, creation, personal settings and authentication are justified prerequisites for entering a project, not extra project destinations. Engine registration and key recovery are operational prerequisites, not new nouns. Introspection runs and filing records remain source provenance; they are not relabelled as agent Receipts.

## Current route inventory and disposition

`P` below means `/projects/$projectId`. Rows containing alternatives enumerate each currently accepted route. “Merge” preserves working capabilities in a named view/panel; “cut” removes empty or redundant navigation, not persisted evidence. Root placeholder routes are real router declarations but render only a heading.

| Current route(s) | Model | Verdict → proposed location; reason |
|---|---|---|
| `/` | Global exception | Keep redirect to project chooser. |
| `/projects` (`companyId`) | Global exception | Keep chooser; company filter remains addressable. |
| `/projects/new` | Global exception | Keep creation; project/industry/region prerequisite. |
| `/companies/new` | Global exception | Keep creation; tenancy prerequisite. |
| `P/dashboard` | Home exception | Merge → Home; one orientation surface. |
| `P/data-sources` | Source | Keep → Sources / Sources. |
| `P/catalog` | Source ↔ Object | Merge → Sources / Schema; preserve source, element and schema-declaration links. |
| `P/relationship-suggestions` | Object ↔ Object | Merge → Sources / Suggestions; preserve element/pool scope and reviewed history. |
| `P/observations` | Source ↔ Object; operational exception for token backup | Merge → contextual Sources problems; token-backup findings link Settings / Token key. No independent Observations destination. |
| `P/sources/$sourceId/introspections` | Source ↔ Object | Merge → source panel / introspections. |
| `P/introspections/$runId` | Source ↔ Object | Merge → source panel / introspection; resolve source from the existing run response. |
| `P/pools` | Pool | Keep → Pools list. |
| `P/pools/$poolId` | Pool ↔ Decision | Merge → selected pool beside list. |
| `P/pools/$poolId/agents/$agentId` | Pool ↔ Receipt | Merge → pool / agent-presence panel; observed identity, not an authorization principal. |
| `P/entitlements` | Object ↔ Pool | Keep → Decisions; preserve existing filters and historical row-decision links. |
| `P/activity` | Receipt | Keep → Activity list and filters. |
| `P/runs/$runId` (`startedAt`) | Receipt ↔ Decision | Merge → selected receipt in Activity; keep both id and startedAt for the existing detail lookup. |
| `P/access` | Settings exception | Merge → Settings / Users; permission derivation remains available. |
| `P/token-key` | Settings exception | Merge → Settings / Token key; distinct from release custody. |
| `P/settings`, `P/settings-project` | Settings exception | Merge aliases → Settings / Project. |
| `P/settings-query` | Settings exception | Keep → Settings / Query. |
| `P/settings-discovery` | Settings exception | Keep → Settings / Discovery. |
| `P/settings-evidence` | Settings exception | Keep → Settings / Evidence. |
| `P/settings-agents` | Settings exception | Keep → Settings / Agents and keys. |
| `P/settings-engines` | Settings exception | Keep → Settings / Engines. |
| `/settings` | Global exception | Keep personal profile, timezone/date and motion preferences. |
| `/companies/$companyId/settings` | Global exception | Keep company defaults, domains, session and SSO configuration. |
| `/sign-in` | Authentication exception | Keep SSO / email-link entry. |
| `/check-email` | Authentication exception | Keep delivery/resend state. |
| `/auth/callback` | Authentication exception | Keep link consumption; never bookmark the token as workspace state. |
| `/auth/confirm-device` | Authentication exception | Keep explicit device confirmation. |
| `/dev/kitchen-sink`, `/dev/shared-patterns` | Engineering exception | Merge specimen coverage into Stage 2's development-only component page; no product navigation. |
| `P/releases` | Receipt | Cut heading-only route; working custody controls are in Activity. |
| `P/workbench` | No implemented screen | Cut placeholder; no query-authoring capability assumed. |
| `P/vocabulary` | Object | Cut placeholder destination; retain actual suggestions in column tag editor. No vocabulary administration UI invented. |
| `P/source-of-truth`, `P/relationships`, `P/knowledge` | Object ↔ Object | Cut heading-only destinations; actual relationship review remains Sources / Suggestions. |
| `P/audit-log` | Receipt / administration | Cut hidden heading-only destination; do not claim Activity implements a general administration audit log. |
| Other `P/$screen` values | None | Cut generic “Not found” heading fallback; use a real not-found state with a parent link. |
| `/dashboard`, `/observations`, `/activity`, `/releases`, `/workbench`, `/data-sources`, `/vocabulary`, `/source-of-truth`, `/relationships`, `/knowledge`, `/entitlements`, `/pools`, `/access`, `/audit-log` | Legacy placeholders | Cut all fourteen heading-only root routes. They currently are not redirects and have no project identity to restore. Offer project selection, not an arbitrary project's data. |

During `/next` prototyping, legacy routes continue working unchanged. The table is a future migration map, not authorization to remove them now. Root `/catalog`, `/token-key` and `/relationship-suggestions` are not additional declared routes merely because navigation can label them.

## Panel, dialog and embedded-view inventory

Each named item below is an independently selectable, expandable or actionable surface in `src/app`; repeated instances of one component share one row. Static facts and individual form fields are included under their owning panel, not counted as extra screens. Destination abbreviations H/S/P/D/A/T mean Home/Sources/Pools/Decisions/Activity/Settings. The state contract later applies to every row.

| Current surface(s) | Model | Verdict and destination; reason |
|---|---|---|
| Drawer; project switcher; all-projects/new-project actions | Global exception | Keep scope switching; merge project navigation to six destinations. |
| Breadcrumb header | Navigation exception | Merge to history Back in `/next`; actual launching context matters. |
| Global search / ⌘K hint; Notifications; Help; drawer account button | No working workflow in shell | Cut inert affordances. Keep functioning personal-settings link. Search stays local to actual list APIs. |
| Toasts; authentication guard; route error boundary | System exception | Keep status/error delivery; never a seventh destination. |
| Dashboard setup/attention sections, exposure summary, pool links and activity/count summaries | Home exception | Merge H; retain actionable facts, remove duplicate representations. Coverage enhancement is conditional below. |
| Connect wizard: engine/name/secret reference; connection test; schemas/sampling/landing strategy | Source | Keep S connection panel, both stages. Never put credential reference or draft fields in URL. |
| Demo pack chooser and prepared/connected feedback | Source | Keep S connection panel; no automatic provisioning or connection. |
| Source pool selector; All / Needs attention; source facts; re-introspect feedback and conflict link | Source ↔ Decision | Keep S filters and source detail; distinguish failure from no objects. |
| Source Filings disclosure and landed/superseded provenance table | Source ↔ Object | Keep S source / filings; immutable provenance. |
| Introspection list, stage/progress detail, diff, error and cancellation action | Source ↔ Object | Merge S source / runs and selected run; no new execution API. |
| Catalogue tree; source/branch/name/decision filters; branch Load more | Source ↔ Object | Keep S Schema; stable selection and bounded branch pages. |
| Element declaration panel: domain/canonicaliser/case-folding/timezone/epoch settings, derived-domain disclosure, breaking-change confirmation, Save/Discard | Object ↔ Decision | Keep S selected column / declarations; preserve confirmations and atomic declaration command. |
| Schema timezone declaration panel and inherited-impact confirmation | Source ↔ Object | Keep S schema declarations; do not conflate with one column's timezone. |
| Scope tags disclosure, existing bindings, domain/tag entry, Vocabulary suggestion buttons, Save binding | Object | Keep S selected column / tags; retain one binding per domain and per-column saves. |
| Suggestions Open / Reviewed; left/right members and treatments; attempts/SQL and history disclosures | Object ↔ Object | Keep S Suggestions; historical and permission-limited evidence remain distinct. |
| Suggestion Confirm / Reject / Not sure; existing/new domain choice, members disclosure, consequences and typed project confirmation | Object ↔ Decision | Keep S suggestion review panel; never infer approval from a tag suggestion. |
| Observation Open / Resolved and filing/type/custody groups; member expansion and History | Source ↔ Object; operational exception | Merge S problems; custody backup problems go T Token key. Preserve resolved history. |
| Prepare operator packet, single-member/group scope, copy/download text | Source | Keep S problem / packet panel; no sending, no partial group silently represented as complete. |
| Pool creation dialog | Pool | Keep P create dialog; name entry and shown-once issuance remain separate stages. |
| Shown-once key dialog; copy/dismiss; “Key already shown” replay dialog | Pool | Keep P transient issuance dialog. No URL or stored draft can recover a secret. |
| Pool credential list; key-version list; key facts | Pool | Keep P credentials panel; separate credential lifecycle from key versions without repeating facts. |
| Issue credential dialog | Pool | Keep P issue; label required. |
| Rotate key dialog with grace/connected and previously seen impact | Pool | Keep P rotate; retain impact check and deliberate confirmation. |
| Revoke key dialog with typed pool name and impact | Pool | Keep P revoke-key; do not remove confirmation for an interaction saving. |
| Revoke credential dialog with live-grant confirmation/reconfirmation | Pool ↔ Receipt | Keep P revoke-credential; distinguish from one receipt's revoke action. |
| Expired-key impact disclosure | Pool | Keep P key-version detail; disconnected presence is not authority. |
| Agents table; expandable credential alias; agent twin and Activity link | Pool ↔ Receipt | Merge P agent panel. Use server `authenticatedWith.kind`; label/alias only for credential, otherwise “pool key (legacy)”. Client names remain self-declared. |
| Row-access four-state summary, search, view pages and both empty variants | Pool ↔ Decision | Keep P; missing filter / override / inherited / no row filter are exclusive. Search appears only with decisions to search. |
| Add override shared object picker including “no default” rows | Object ↔ Pool | Keep P/D picker; catalogue fetched only when picking, not embedded as the pool's list. |
| Inherited row decision and link to object default; collapsed inherited-pool disclosure | Object ↔ Pool | Keep P/D; read-only default above narrowing override. |
| Entitlement scope/filter/layout controls; name groups; Members disclosure; tree; member checkboxes and collect/review-all | Object ↔ Pool | Keep D Columns; exact selected members only, not future discoveries. |
| Bulk decision bar: treatment/mask/clear justification/custody readiness, Apply/Cancel | Object ↔ Pool | Keep D Columns; no return to undecided and no silent unsupported-type application. |
| Row editor level choice; Builder/Text; clause/group/negation controls | Object ↔ Pool | Keep D Rows; pool-launched editor is override-only. No default + override composes as override alone. |
| Row preview: count, treated samples, aggregate-only suppression, custody-sealed output, errors | Decision ↔ Receipt | Keep D preview; privileged existing preview, not unrestricted source values. |
| Row history pages and historical contributor detail | Decision ↔ Receipt | Keep D history; editing current policy never rewrites receipt evidence. |
| Activity filters, outcome tabs, day/custody summaries and scoping-boundary events | Receipt | Keep A; select one summary per fact and retain event distinctions. |
| Inline Details expansion and standalone Run record | Receipt ↔ Decision | Merge A selected receipt; one representation, permalink and list context. |
| Statement/answer/planned evidence, omissions, row scope and preview evidence | Receipt ↔ Decision | Keep A receipt sections; recorded versus unavailable is explicit. |
| Custody release events and Revoke unredeemed access | Receipt | Keep A receipt; existing action is immediate, no new confirmation assumed. |
| Suggestion/decision contributor links; Copy record id; Full recorded metadata disclosure | Receipt ↔ Decision | Keep A contextual links/details. Metadata includes capture, versions, SQL, tokens, elements, sources, rows, latency and stages; no second standalone screen. |
| Access member list, direct/inherited filters, permission derivation and authorization trace | Settings exception | Merge T Users; inspect only, do not invent membership mutations. |
| Project settings six tabs, editable row disclosures/default/unset controls and shared Save/Discard diff | Settings exception | Keep T existing six tabs; retain unsaved edits across tabs. |
| Project details rename; industry migration and typed confirmation | Settings exception | Keep T Project disclosures. |
| Custody provider selection/live-grant reconfirmation; connection details/check; signing-key details/rotation | Settings exception | Keep T Project; provider configuration and token key are different things. |
| Engine register; edit/details; Test connection; per-source assignment | Source operational exception | Keep T Engines; Sources links here if no verified Engine exists. |
| Token key versions/status, backup and rehearsal history; Rehearse now | Settings exception | Keep T Token key; no key material rendered. |
| Token key rotate and restore forms with reason/version/typed project confirmation | Settings exception | Keep T Token key action panel; preserve company/project-admin requirements. |
| Personal profile/preferences form; company settings form | Global exception | Keep outside project destinations; do not disguise company scope as project settings. |
| Project chooser/company filter; create project/company forms | Global exception | Keep global scope entry. |
| Sign-in provider/email form; check-email/resend; callback outcomes; device confirmation | Authentication exception | Keep auth flow and intended destination restoration. |
| Kitchen sink and shared-pattern specimen panels/dialog examples | Engineering exception | Merge Stage 2 component page; not additional product capabilities. |

## URLs and restoration

Canonical proposed project base: `/next/projects/:projectId`. Exactly six path suffixes: `/home`, `/sources`, `/pools`, `/decisions`, `/activity`, `/settings`. Global tenancy/settings routes remain outside this namespace during the prototype. IDs, not labels, identify entities. Search is typed, validated and canonicalised; invalid or inaccessible identities show a named unavailable state rather than silently selecting another pool.

| URL state | Meaning / applicable destinations |
|---|---|
| `source`, `object`, `column`, `schema`, `pool` | Selected existing identifiers; carry all relevant context across S/P/D and contextual links. |
| `view` | S: sources/schema/suggestions; D: columns/rows; A: all/refused/incomplete/treated; T: project/query/discovery/evidence/agents/engines/users/token-key. |
| `groupBy`, `decision`, `rowState`, `prefix`, `branch`, `attention` | Existing grouping and filters made addressable. `rowState=no-row-filter` is console vocabulary; map existing API `unscoped` unchanged. |
| `from`, `to`, `agent`, `observationKind`, `observationGroup`, `reviewState` | Existing Activity, observation or suggestion scope. Freeze relative date presets to the actual supported range semantics; do not claim arbitrary intervals until the endpoint accepts them. |
| `panel` | One primary panel: source/connect/filings/introspections/introspection/problems/packet/declarations/tags/suggestion/pool/agent/credentials/row-editor/row-history/receipt/setting/engine/token-key. |
| `action`, `step`, `keyVersion`, `credentialId`, `run`, `startedAt`, `decisionId` | Existing dialog/action or historical selection; action permits opening, never executing a mutation on URL load. A connect step without its in-memory prerequisites returns to step 1 with an explanation. |
| `expanded`, `selected` | Explicit disclosure and member IDs for bounded views; never implied authorization or “all future columns”. Large selections are a dependency below, not silently truncated. |
| `anchor`, `offset`, `panelAnchor`, `panelOffset` | Stable row/section identity plus within-row offset for list and panel scroll. History retains loaded pages and measured positions as an optimisation. |

Examples (identifiers are placeholders, not real project data):

```text
/next/projects/p/sources?view=schema&source=s&object=o&column=c&panel=tags&anchor=o&offset=0
/next/projects/p/pools?pool=q&rowState=overrides&panel=row-editor&object=o
/next/projects/p/decisions?pool=q&source=s&object=o&view=rows&panel=row-history&decisionId=d
/next/projects/p/activity?pool=q&view=all&panel=receipt&run=r&startedAt=2026-10-14T12%3A00%3A00Z
/next/projects/p/settings?view=engines&panel=engine&action=register
```

Opening detail pushes history and records the launching entry; closing it or Back returns to that entry, including filters and scroll. If opened directly, Back uses the same destination's list; a nested agent falls back to its pool, a historical decision to the object's Decisions view, a global form to its chooser. Do not use an unvalidated external `returnTo`. Filter typing and settled scroll replace the current entry rather than adding a history entry per character/pixel; explicit destination, view and selection changes push. Forward restores the same selection. Focus returns to the launching control, or the nearest remaining row if it disappeared.

Restoration waits for data, fonts and list measurements before positioning. Existing cursor APIs can replay pages to locate an anchor; this costs requests proportional to depth. No new seek API is assumed. Back within a live session can reuse cached pages. A cold deep link to a deep row shows loading and allows cancellation while pages are traversed, never a fabricated exact position. Deleted items, revoked permission, expired cursors and changed ordering produce “Saved position unavailable” with the nearest accessible parent. Exact pixels cannot be promised after data or viewport changes; preserve the anchor and within-row position where it still exists. This is a limit on the “exact view” requirement, not silent success.

**Addressable does not mean secrets or unsaved data in URLs.** Passwords, references to secrets, shown-once keys, predicate literals, draft input, typed confirmations and auth tokens are not serialised as workspace state. The panel is addressable; its sensitive transient contents are not replayable. Sharing a URL shares persisted view state, not another user's unsaved work. URLs do not confer permissions. Authentication callbacks retain their existing one-use handling.

## State survival and leaving work

| State | Navigation contract |
|---|---|
| Filters, view, pool/source/object, selected receipt and open panel | URL is authoritative; restore on Back/Forward and cold entry, subject to supported API filters and authorization. |
| Expanded members, finite selected IDs | URL for bounded selection; validate against current membership before enabling Apply. Never equate hidden/removed members with confirmed selection. |
| Scroll and keyboard focus | Anchors in URL, measured positions and launching focus in history/session memory; remeasure before restoring. |
| Unsaved source, declaration, tag, row predicate and settings edits | User/project/entity-scoped memory draft survives same-session navigation after explicit Keep draft and leave. No new draft storage API or persisted browser copy of predicate values. |
| Dirty exit | Offer Stay, Keep draft and leave, or Discard and leave. Save is offered only when valid and permitted, and navigation occurs only after success. A failed save retains edits. Refresh/close uses the browser unload warning; memory drafts cannot survive reload. Say so. |
| Pool/key mutation or shown-once secret | Preserve the existing deliberate dismissal/exit protection; ordinary “keep draft” must not hide or persist an issued key. Never replay issuance on history navigation. |
| Cross-tab settings edits | One existing settings draft; switching tabs does not discard it. Scope switches isolate drafts; sign-out clears them. |
| Concurrent edits or changed permissions | Revalidate on return/save, show conflict/refusal and retain the draft for correction; do not silently overwrite. Do not promise revision conflict detection beyond existing endpoint support. |

Columns and rows remain separately saved commands. No combined “Save all” promises an atomic transaction that does not exist. A tag binding is saved per column. Reading a suggestion never applies it automatically.

## Three admin flows and budgets

Counting convention: start on project Home; count each pointer activation, including focus in a text field and both opening and choosing a native select. Scrolling and server wait time are reported as unbounded data costs, not clicks. “Screens” counts distinct routed screens today and destination workspaces proposed; panels are named separately so consolidation does not hide work. “Keystrokes” below counts characters entered into fields on the pointer trace (no paste, no correction); keyboard-only navigation keys are not misleadingly added to just one side. All paths assume the required permissions and successful existing endpoints.

These are explicit small fixtures, not claims for all dataset sizes. The proposed flow does not auto-apply decisions, bypass confirmations or assume a new API. Strictly reducing all three metrics in every flow is impossible: some current paths already have zero entered characters and one working screen. Those floors are review exceptions, not capabilities to invent.

### A. Connect, introspect, confirm/correct scope tags

Fixture: verified Engine already exists; two columns in one object, both with a usable Vocabulary tag suggestion; domain `region` on both. Enter name `Reporting` (9 characters) and operator-provided reference `secret://sources/reporting` (26). No sampling or landings; all readable schemas. Wait for completed introspection; no polling clicks counted.

| Admin step | Today clicks | Proposed clicks | Keyboard-only reachable |
|---|---:|---:|---|
| Home → Sources; Connect | 2 | 2 | Yes: navigation and button. |
| Choose Engine, enter name/reference, Test connection, Connect and introspect | 6 | 6 | Yes: select, labelled fields and submit buttons. |
| Open discovered schema; expand object | 2 | 1 | Yes: schema tab / tree arrows. Proposed success retains source and opens Schema, no extra action. |
| First column: select, open Scope tags, focus/type domain, choose suggested term, Save | 5 | 4 | Yes. Proposed selected-column tags panel is directly available in the tagging view; no extra disclosure. |
| Second column: select, open Scope tags, focus/type domain, choose term, Save | 5 | 3 | Yes. Proposed panel stays on Tags and offers the explicitly chosen prior domain as the current draft; save remains deliberate. |
| **Total** | **20 clicks; 3 screens; 47 characters** | **16 clicks; 2 destinations; 41 characters** | Entire flow can use Tab/Shift-Tab, arrows, Space and Enter. |

Today screens: Home, Data sources, Catalogue. Proposed: Home, Sources, with connection then schema/tag panels. The 6-character saving is only reusing the administrator's chosen domain for the next column; never an inferred Vocabulary domain. For a corrected suggestion, both paths add the actual replacement text and its focus action. For N columns, every column still requires review and a save; no invented bulk-confirm API. The IA makes no claim to save essential name/reference characters. Failures keep the same panel and use the shared states below.

### B. Decide what a pool sees, including a row filter

Fixture: an existing pool with a bound source; first visible object, one supported column; treatment tokenized with required declarations already valid; first row-filter column suitable for `IS NOT NULL`. Start from Home's pool link. No custody configuration, free-form predicate value or clear justification needed in this fixture.

| Admin step | Today clicks | Proposed clicks | Keyboard-only reachable |
|---|---:|---:|---|
| Open pool's Decisions from Home | 1 | 1 | Yes: contextual link retains pool. |
| Select the visible name group; choose tokenized; Apply | 4 | 3 | Yes. Proposed row treatment choice selects the explicit loaded member scope; choose + Apply, no separate checkbox for this single-group action. Bulk still uses checkboxes. |
| Show Everything, open By table, open the object’s Rows editor | 3 | 0 | Yes today. Proposed next step uses Rows and the same object selection instead. |
| Rows view and select that object | 0 | 2 | Yes; existing object picker, no new catalogue endpoint. |
| Start predicate; Preview; Save row decision | 3 | 3 | Yes. Each remains explicit; no predicate is silently created or saved. |
| **Total** | **11 clicks; 2 screens; 0 characters** | **9 clicks; 2 destinations; 0 characters** | Entire flow keyboard reachable. |

Today's 3-click object path includes Everything because the just-decided column leaves the default Needs a decision filter. The object-level Rows action does not require expanding its columns; extra pagination is additional on both sides. Proposed panels: Columns action, Rows editor/preview. Neither implementation can reduce zero text input. Home plus Decisions is already two screens; reducing it to one would require doing policy editing on Home, contrary to the six-destination model. Longer current routes through Pools then Entitlements lose that transition, but are not substituted for the shortest baseline to manufacture a saving. For a literal predicate, both paths must enter the literal unless a known finite domain supplies actual choices. Scope-reference choice is withheld until step 3a exists.

### C. Investigate a read and revoke unredeemed access

Fixture: known visible Activity row with recorded custody events, still-unredeemed grants and revoke permission. Investigation means reading request, delivered treatments and custody events; no search string is necessary.

| Admin step | Today clicks | Proposed clicks | Keyboard-only reachable |
|---|---:|---:|---|
| Home → Activity | 1 | 1 | Yes. |
| Details / select receipt; inspect evidence and custody | 1 | 1 | Yes. Proposed detail is beside the list, not a new route workspace. |
| Revoke unredeemed access; inspect result | 1 | 1 | Yes; existing mutation, no text confirmation. |
| **Shortest-path total** | **3 clicks; 2 screens; 0 characters** | **3 clicks; 2 destinations; 0 characters** | Entire flow keyboard reachable. |

Today's optional Open evidence record adds one click and a third screen; the proposed selected receipt permalink removes that extra step (4 → 3 clicks; 3 → 2 screens on that path). It does not improve the already-inline minimum. The benefit is stable shareable selection, retained list context and less scrolling, not a fictitious keystroke reduction. Already redeemed/expired grants remain evidence; successful revocation cannot recall keys already received.

**Budget decision for Rick:** accept non-increase at existing floors for B/C, with reductions on A and on avoidable multi-screen routes. The request to cut every metric for all three flows cannot honestly be met using existing capabilities. Before implementing Stage 3, verify these source-derived traces in the browser, including tab order and the exact visible fixture; no present keyboard usability certification is claimed.

## Shared state vocabulary

Define these once and reuse them in every destination, panel and dialog. Labels below identify contracts, not mandated final visual copy.

| ID | State | Shared behavior |
|---|---|---|
| L | Loading | Initial: labelled progress with reserved content area. Refetch: retain last result, mark refreshing/as-of, do not replace it with empty. Mutation: mark its action pending and prevent duplicate submission. |
| E0 | Empty dataset / setup missing | Explain the missing prerequisite and offer only a permitted existing action. Never display zero for unknown data. |
| EF | Empty filtered result | Preserve filters, say no matches and offer clear/change filters. Do not suggest creating duplicate data. |
| X | Error | Load error: scoped explanation and Retry. Mutation error: preserve draft and explain the refused/failed action. A subquery failure must not erase successful sibling content. |
| P | Partial permission / unavailable detail | Show allowed data, identify unavailable detail without leaking counts/identities; hide or disable mutation with a reason. No permission is not “none exist”. Direct forbidden links show unavailable and parent navigation. |
| M | Too many items | Existing cursor pages or branch Load more; bounded render window; show loaded count and server total only if actually supplied. Preserve selection/anchor. No silent truncation or browser-wide fetch-all to simulate pagination. |
| S | Stale or unrestorable | Show as-of/changed-since-open information, retain draft, refresh or choose parent. Do not claim exact restoration after removal or permission loss. |

Every row below uses L/X/P; E and M are specified so no screen is omitted. Dialogs with a finite form use M as scrollable bounded content, not fabricated pagination. Forms cannot be “empty dataset” when merely blank.

| Screen or panel family | E0 / EF application | M application and partial-permission boundary |
|---|---|---|
| Home | No sources/pools/activity; no matching source selection | Compact capped lists with More links; coverage/counts unavailable are explicit, not zero. Independent sections can fail separately. |
| Sources / Sources, connection and demo panels | No sources; no attention matches; no verified Engine; no readable schemas; no prepared demos | Source list bounded to available API contract; schema/demo lists scroll. Connect only for admin; see dependency for server pagination. |
| Sources / Schema, column/schema declarations and tags | No objects; empty branch/prefix; no declaration/tag/suggestion | Cursor branches and member windows. Declarations may be readable while editing is forbidden; draft retained on errors. |
| Sources / Suggestions and review | No open suggestions / no reviewed matches / no suitable token domain | Existing pages and member expansion. SQL hidden without evidence permission; confirmation may be blocked by treatment/declaration state. |
| Source filings, introspections and run details | No filings/runs/diff; missing historical run | Existing pages, bounded diff; cancel only for permitted running states. Unsupported/quarantined items are visible outcomes, not load errors. |
| Problems, group members, history and operator packet | No open/resolved problems; no members in current group | Existing pages; incomplete membership blocks a misleading complete packet. Custody findings remain admin-scoped. |
| Pools list/create and pool detail | No pools; pool unavailable; no credentials/working keys/agents | Cursor lists where supported; key lists bounded/scrollable. No-admin view excludes issuance/revocation controls. |
| Credential issue/rotate/revoke, key impact, shown-once output | No affected connected agents is valid; lost/replayed key cannot be recovered | Bounded impact content; reconfirm changed grants; no secret on reload. L/X apply to issuance and copy, P to all actions. |
| Agents/alias and agent presence panel | No agents; agent not seen; legacy authentication | Cursor agents; expanded alias wraps/scrolls. `authenticatedWith` controls provenance, never timestamp inference in console. |
| Pool Row access and object picker | No overrides with defaults / no project defaults / no matching decisions / no picker match | Paged decision views and bounded picker. Inherited defaults read-only; no-default object still eligible for an override. |
| Decisions Columns, groups/members and bulk action | No pools/bound source/catalogue; no undecided or matching members | Existing group/member cursors and virtual tree. Unsupported types and restricted members cannot be applied; exact member collection is explicit and cancellable. |
| Decisions Rows/editor/preview/history | No default/override, no columns, no history, zero preview matches | Existing picker/history pages; preview maximum already defined by API. Counts/samples may be suppressed or sealed; never treated as empty source. |
| Activity list, receipt sections/metadata/custody | No requests/filter matches; record not found; no release events | Cursor list/virtual rows and bounded detail. Sampling, retention, missing details and permission restrictions distinguished; incomplete is a receipt outcome. |
| Settings Project/Query/Discovery/Evidence/Agents and keys | Unset/inherited setting, unavailable provider status | Finite rows and scrollable changes; read-only role, provider permission and live-grant conflicts explicit. |
| Settings Engines/register/edit/assign | No engines; no verified eligible engine; no source assignments | Bounded list, existing API limits; admin-only mutations, independent health errors. |
| Settings Users/permission derivation | No accessible members/filter matches; unavailable trace | Existing member/filter response contract; never invent invite/edit controls or expose denied identities. |
| Settings Token key/rotate/restore/rehearsal | No key/status/history; no restorable version | Bounded version/history; restore's stronger permission stays enforced. Key absence is not successful recovery. |
| Personal/company settings | Unset optional values; scope unavailable | Finite forms, constrained lists such as domains; separate company permissions. |
| Project chooser/create company/create project/switcher | No accessible projects/companies/industry options | Available list contract; no invented ability to create in an inaccessible company. |
| Sign-in/check-email/callback/device confirmation | No configured provider, missing/expired/consumed link | Finite forms; rate limits/errors stay scoped. No account-discovery leakage. |
| Shell/not-found/error boundary/component specimens | No current project or invalid destination | Navigation stays finite; specimen page demonstrates L/E0/EF/X/P/M/S without production data. |

## Dependencies and costs — not assumed in the flows

Costs here are engineering scope, not unsupported day estimates. The proposed A/B/C flows above avoid these additions.

| Requirement / gap | Available now or decided | Cost and behavior without the capability |
|---|---|---|
| Scope-reference row predicates | Recorded 5.37 step 3a; not assumed executable by this IA | Domain declarations, authorized resolution/freshness, execution and evidence work plus corresponding tests. Until available, static predicates only; do not offer a working scope control or invent grants from tags. |
| Automatic complete domain/tag classification or bulk confirmation | Existing suggestions are tag terms; per-column binding exists | New semantics/API would need a separate decision. Use explicit domain, suggestion/correction and existing per-column save. No source-tag API. |
| Home treemap: area = rows, worst treatment across pools, narrowing pools | Catalogue and pool decision facts exist; a complete coherent per-object row-count/coverage payload has not been established by this audit | Verify existing read contracts before prototype. If insufficient, aggregation/count provenance, permissions, freshness and bounded query cost require separate work. Until then show available source/object and pool facts in lists; omit the treemap, never equal-area tiles labelled row area or privilege-bypassing preview queries. “Worst” also needs an explicit reviewed ordering; treatments are not a natural total order. |
| Arbitrary URL date/filter state | Existing endpoints expose defined filters/ranges | Translate only supported states. Arbitrary intervals or a frozen historical dataset require API work; otherwise say live data and preserve supported filter intent. |
| Instant cold deep-link scroll at large depth | Existing cursor traversal, not a seek-by-anchor API | Replay pages with visible progress/cancel; an indexed seek endpoint would require API, permission and pagination tests. No exact-time restoration guarantee. |
| Unlimited shareable multi-selection | Explicit IDs fit only bounded URLs; no saved-selection service assumed | Keep bounded selections addressable; large selections stay session-local with an explicit “selection not included in link” limit. A server selection/saved-view store would need lifecycle, authorization and schema work. Do not fake completeness. |
| Durable unsaved drafts across reload/devices | Existing local UI drafts, not a draft service | Same-session memory + exit warning only. Durable storage would require data-handling, retention, permission and concurrency design. |
| Capped lists where APIs return a whole list | Some current lists have cursors; some return full lists | Reuse actual pagination where available. Local rendering limits may bound DOM cost but do not bound fetch cost. A new cursor contract is separate API work; show loaded/total honestly in the meantime. |
| Type-aware values for every predicate type | Catalogue types and validated grammar exist; current builder includes generic text input | UI adapters and edge-case tests are needed, with no new data API assumed. Only existing finite suggestions/enums can become pickers. A known text type is not a known finite value set. Server permission/schema/concurrency refusals remain possible even after local validation. |
| Users administration / global search / Workbench / audit log | Current Access is inspection; shell search and several routes are placeholders | Keep inspection and local search; omit unimplemented workflows. Each needs its own approved feature scope, endpoints and permissions. |

The strict “every state is a shareable URL” requirement therefore has named limits for secrets, drafts, unbounded selections and mutable data. These limits and the interaction-budget floors require Rick's review; they must not be hidden by assuming new backend capabilities.

## Approved additions: next-slice reservation

Cut in the inventory means remove today’s empty destination, not cancel the next slice. These capabilities are reserved without a seventh project destination:

| Next-slice capability | Home within the six | Noun / relationship and scope |
|---|---|---|
| Workbench | Activity / Workbench view | Pool ↔ Receipt: compose a prompt under an explicit pool, then inspect its result and five-part trace. Unsaved prompt follows the draft contract. No execution capability is assumed today. |
| Knowledge | Sources / Knowledge view | Object ↔ Object: contextual business knowledge attached to objects. Global knowledge configuration belongs in Settings; unanchored knowledge authoring needs a separately reviewed model. |
| Vocabulary administration | Sources / Vocabulary view | Object: terms, synonyms and declarations used to understand object members; project overrides retain industry provenance. |
| Source of truth | Sources / Source of truth view | Source ↔ Object: designation and provenance of authoritative objects, not a competing permissions system. |
| Relationships | Sources / Relationships view | Object ↔ Object: declared/reviewed relationships; current Suggestions becomes its review queue. |
| Releases | Activity / Releases view | Receipt: custody delivery, redemption and revocation; each release resolves to the originating receipt. No duplicate independent ledger. |

These are navigation reservations, not invented feature specifications. A capability genuinely outside the five nouns must first state its user job and durable entity, explain why no existing destination/view works, and demonstrate a recurring independent workflow. Rick approves a noun-model change before any seventh destination; a vacant placeholder or menu length is not justification. Unanchored Knowledge is the current conditional case, not authorization to add that destination.

## Approved additions: Home contract checkpoint

Read-contract audit at `b1da401`: `CatalogNode` in `src/shared/api/catalog.ts` has child/member and treatment counts, but no per-object source row count. `SourceListItem` in `source-schemas.ts` supplies source-wide per-pool column decisions, not table row counts. `GroupPage` / `MemberPage` in `entitlement-groups.ts` allow per-pool treatment inspection and object membership through pagination; these counts are members, not source rows. Recorded Activity row counts describe individual reads; privileged row previews describe a particular effective predicate. Neither is a safe source-size feed.

**Insufficient for the requested coverage treemap: Home uses lists in Stage 3.** The Stage 2 treemap is a labelled synthetic component specimen only. No exposure ranking is selected. Before changing this decision, repeat the contract check; if sufficient, submit an explicit “most exposed across pools” ordering (including mixed, custody, aggregate-only, withheld and undecided) to Rick for approval. Do not infer that ordering from colour, declaration order or a count.

Costed scheduling dependency (relative engineering scope, not calendar estimates): (1) medium: decide exact versus estimated counts, freshness, unknown/zero semantics and permission scope; (2) large: bounded per-object/per-pool aggregation read model, pagination and source-count acquisition without running privileged previews for Home; (3) medium: schema/client and authorization, missing-data, consistency and performance tests; (4) medium: approved exposure ordering, visual integration and reviewed baselines. Rick schedules these as a separate dependency; lists ship without it.

## Approved additions: discoverability and realistic flow B

| Flow | First-time entry and cue today | Proposed cue without instruction | Acceptance check |
|---|---|---|---|
| A: connect and tag | Data sources has “Connect a source”; after connection “Explore schema” leads to column declarations and a collapsed “Scope tags”. Vocabulary suggestions are not visible until that disclosure. | Home no-source empty state: “Connect a source”. Connection success: “Review column scope tags” opens the same source’s Schema view with Tags visible. Each column shows saved domain/tag or “No scope tag”; suggestion buttons are labelled as suggestions, never decisions already applied. | An unfamiliar admin can locate Connect, follow success guidance and save/correct a column binding without being told where declarations live. |
| B: decide columns and rows | Pools → selected pool → “Row access” provides “no row filter”, guidance and a link to Entitlements. On arrival row filtering is an object-level “Rows” action in By table; the destination name itself does not advertise rows. | Pool detail keeps “Row access”, “Set an object default” and “Add pool override”, plus the default-versus-override sentence. The default link opens Decisions / Rows with pool context and object picker; Columns and Rows are visible labels. No-default empty state repeats these actions. | Starting at Pools, an unfamiliar admin can explain default versus override and open the row editor without coaching or a hidden icon. Test independently of shortest-path timing. |
| C: investigate and revoke | Activity → “Details”; custody section names “Revoke unredeemed access”. Release action is discoverable only after expanding the row. | Home recent-read entry links to Activity selected receipt; Activity rows name the outcome and custody status when present. Receipt section heading “Released under custody” contains “Revoke unredeemed access” and the cannot-recall explanation. | Admin can find the read and distinguish unredeemed revocation from recalling already delivered data, without a new Releases destination. |

**Realistic B, beside the shortest path above:** same fixture, but the admin starts at Home, chooses Pools (1), a pool (1), then follows the “no row filter” count or empty-state Entitlements link in Row access (1). These existing links already choose Everything / By table. Expand the visible object (1), select its member (1), choose tokenized (2), Apply (1), open Rows (1), Start predicate (1), Preview (1), Save (1): **12 clicks, 4 screens, 0 entered characters**. Row access is an embedded section, not an extra screen; scrolling to find it is additional discovery cost, not a click.

Proposed realistic path: Pools (1), select pool (1), “Set an object default” (1) opens Decisions / Rows; choose object (1), Start predicate / Preview / Save (3), switch Columns (1), choose tokenized / Apply for its explicit member scope (3): **11 clicks, 3 destinations, 0 entered characters**. The pool detail is a panel beside Pools, not a fourth destination. This sets an object default; choosing “Add pool override” instead retains override-only semantics. Shortest path remains **11 → 9 clicks, 2 → 2 screens, 0 → 0 characters** as recorded above. These are source-derived/proposed budgets to verify, not a substitute for first-time discovery observation.

Rick accepted budget floors with no regression and honest reductions; history Back for `/next`; URL limits on secrets, drafts, unbounded selection and exact restoration; and existing-mechanism column tagging.

## Stage 1 review boundary

Approve or revise: the six destinations and inventory dispositions; history Back replacing breadcrumbs in `/next`; supported-state URL contract and its explicit limits; existing-mechanism column tagging; and the honest interaction budgets (including floors). The Stage 1 document does not implement tokens/components, Stage 3 routes or product changes. Stage 2 artifacts are reviewed separately. Rick approved Stage 1 with the additions recorded above. Stage 2 was subsequently reviewed and Stage 3 authorized, subject to the visx-consumer and brand-rollout cost records. See [the prototype record](console-next.md).
