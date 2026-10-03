# Action acknowledgment audit — 2026-09-30

Scope: all rendered application actions in `src/app`, plus shared retry controls. This is a code audit of UI acknowledgment and server duplicate behavior, not a claim that every action was exercised with concurrent requests. At the initial audit, only Data sources Re-introspect/Retry and Landing alignment were changed. The tables preserve that before-state; the follow-up implementation and verification are recorded below.

The §5.5 rule has three parts: disable the initiating action immediately and say work has started; keep it disabled until the result or work is observable on the screen; put a refusal beside the action. A disabled button with an unchanged label is only partial acknowledgment. Server idempotency and visible acknowledgment are separate properties.

## What the repeated Re-introspect clicks produced

A read-only inspection of the development database found three additional runs for source `f41a3901-04a4-47fe-8aaa-0ccad1c643f1` (`demo_f41a390104a447fe8aaa0ccad1c643f1`). All completed. Times below are UTC on 2026-09-30.

| Run | Created | Completed | Diff entries |
|---|---|---|---|
| `01a0f364-c18f-7007-9b09-6ca742c23d93` | 17:37:41.774 | 17:37:42.429 | 11 |
| `01a0f364-f225-7257-9445-42086e4f8a76` | 17:37:54.211 | 17:37:54.617 | 0 |
| `01a0f365-5900-7821-9ddd-a12e8fa22cab` | 17:38:20.541 | 17:38:20.926 | 0 |

These were successive accepted runs, not a backlog of overlapping runs. Each finished before the next was requested. The server rejects a request only while another run is active. No retained HTTP refusal log was available, so this does not establish whether additional clicks were refused.

The button previously kept its label while pending. Fast completion restored the same connected state, and the timestamp displayed only minutes: all three completions looked identical there. Refusals appeared above the table, away from the clicked row.

The fix adds a synchronous submission guard, a disabled **Starting…** button through the list refresh, and a persistent **Introspection started / View started run** receipt beside the action. The confirmed POST response is placed in the source cache before refreshing it. Conflicts render their unchanged server message and exact active-run link in the action cell. The failed-source Retry uses the same mechanism. An active run still permits clicking the maintenance action after submission settles, so the existing conflict can explain why another run cannot start. Archived sources still have no action.

Landing labels now remain on one line and align left with their filing control, including long demo source names. No class or stylesheet was added.

## Commands and external effects

“Pending guarded” below means the rendered action disables during its mutation. Except for the new source guard, this is not a separate synchronous mutex or proof of server idempotency. Repeated accepted requests can also arise after a lost response or a retry; those are distinguished from an ordinary double-click.

| Screen / action | Acknowledgment and refusal placement | Repeated-request effect / protection |
|---|---|---|
| Data sources: Re-introspect; failed-source Retry | **Meets rule after this fix.** Starting…, disabled through refresh, persistent exact-run receipt; refusal beside action. | Synchronous client guard. Server serializes source admission and refuses an active run. A later click after completion intentionally creates a new run. |
| Data sources wizard: Test connection | **Acknowledges.** Testing…, disabled, then connection result/next step; refusal in the same form beside controls. | Repeats a connector test if separately submitted; no second source is created by testing. |
| Data sources wizard: Connect and introspect | **Acknowledges.** Connecting…, disabled through invalidation, then closes onto source list; refusal in form. | Pending guarded; source name uniqueness prevents a second same-named source. Requests can repeat connection work; not an idempotency-key command. |
| Demo card: Connect | **Partial.** Connecting… and disabled until refreshed; connected card is observable. Error is below the entire card grid rather than beside the clicked card. | Pending guarded; reserved source identity prevents a second demo source. Existing active/completed connection is reused; failed connection may start a retry. |
| Create project | **Acknowledges.** Creating project…, disabled through refresh, then navigates; refusal at submit area. | Pending guarded in handler and button. Company/name uniqueness refuses duplicate project creation. |
| Create company | **Acknowledges.** Creating company…, disabled through refresh, then navigates; refusal at submit area. | Normal pending clicks blocked. No request idempotency or company-name uniqueness: two accepted submissions can create two companies, e.g. retry after a lost response. |
| Pools: Create pool | **Acknowledges.** Creating…, disabled, then issued-key dialog; refusal beside submit. | Stable per-dialog idempotency key and server replay ledger, plus name uniqueness. Replaying the request does not create a second pool/key. |
| Pool key: Confirm rotation | **Acknowledges.** Working…, disabled, issued-key dialog; refusal beside submit. | Stable per-dialog idempotency key; replay does not rotate again. |
| Pool key: Confirm revocation | **Acknowledges.** Working…, disabled through refresh, then updated key state; refusal beside submit. | Stable per-dialog idempotency key; replay does not revoke another key or create a second operation. |
| Issued-key dialog: Copy key | **No start acknowledgment.** No disabled/Copying state during clipboard write. Copied/error appears locally afterwards. | Can invoke clipboard twice. Both writes contain the same key; does not issue another key. Dismiss remains gated by successful copy. |
| Token custody: Rehearse now | **Partial.** Rehearsing… and disabled; refreshed rehearsal result. Refusal is at the bottom of the screen, away from the action. | Pending guarded. Repeated accepted calls repeat escrow verification and update rehearsal timestamps. |
| Token custody: Confirm rotation | **Partial.** Working… and disabled through refresh; refusal outside the confirmation form at screen bottom. | Stable rotation idempotency key prevents a second rotation for the same request. |
| Token custody: Confirm restore | **Partial.** Working… and disabled through refresh; refusal outside the confirmation form at screen bottom. | Pending guarded, but no request idempotency key. Server serialization prevents overlap, not a second restore operation if submitted again. |
| Entitlements: Apply to selection | **Partial.** Applying… and disabled through invalidation; selection clears. Feedback is outside the fixed action bar and can be offscreen. | Stable bulk idempotency key protects repeated requests for the same selection/command. |
| Introspection detail: Cancel introspection | **Partial.** Cancelling…, disabled through invalidation, then cancelled state. Refusal appears below the stage rail, not beside the top action. | Same run is addressed; repeated cancellation cannot create another run. Admission/state checks still apply. |
| Project settings sections: Save changes | **Partial.** Disabled through mutation/invalidation, but unchanged label and no in-progress status. Result/error is at form bottom, save control at top. | Ordinary pending clicks blocked. Repeated accepted saves can append repeated settings audit entries; no duplicate project. |
| Personal settings: Save changes | **Partial.** Same unchanged disabled label; result/error at form bottom. | Repeated accepted saves update the same profile and can append repeated audit entries. |
| Company settings, including SSO: Save changes | **Partial.** Same unchanged disabled label; result/error at form bottom. | Repeated accepted saves update the same company and can append repeated audit entries. Enforcement validation is still server-side. |
| Project details: Save name | **Does not acknowledge.** No pending disable or status. Feedback uses shared message below the forms; API error object loses its message to generic fallback. | **Can be clicked twice while pending.** Each accepted write calls the rename function and records `ProjectRenamed`, even for the same name. Does not create a second project. |
| Project settings: Migrate industry | **Does not acknowledge.** No pending disable/status. Shared message below forms; no result-cache invalidation. API error falls back to generic text. | **Can be clicked twice while pending.** Repository serializes writes but increments `vocabulary_revision` on every accepted call, including the same destination. Two requests can increment twice. |
| Sign-in: request magic link / recovery link | **Partial.** Form is replaced with LoadingState, then check-email screen. No disabled initiating control retained; error replaces the form. | After render, action is unavailable. No synchronous handler pending guard/idempotency key. Each accepted issuance creates token/mail and invalidates older outstanding tokens; rate limits bound volume but are not deduplication. Multiple accepted requests can send multiple mails. **Confirmed intentional by the user:** this enables recovery from non-delivery and remains bounded by rate limits; it is not a deduplication defect. |
| Sign-in: Continue with provider | **Does not acknowledge in application UI.** Calls `location.assign`; button has no disabled/starting state before navigation. | Repeated starts can create separate OIDC flows and replace the state cookie. Callback state is single-use; this is not duplicate membership/session acceptance. |
| Confirm device: Yes / No | **Partial.** Buttons replaced by LoadingState; error replaces confirmation. No explicit synchronous pending guard. | Single-use token consumption prevents accepting the same token twice; a replay can refuse. |
| Magic-link callback retry | **Partial.** Retry enters LoadingState rather than retaining disabled action. Error is on the callback error screen. | Callback tokens remain single-use; retry cannot promise successful replay. Recovery must follow the returned refusal. |

## Read actions

Reads do not create duplicate domain records, but their acknowledgment still matters. A query library may coalesce/cancel repeated reads; that does not make an unchanged button feedback.

| Actions | Finding |
|---|---|
| Dashboard: Refresh dashboard; Activity: Refresh | **No in-progress acknowledgment or disable** while existing data is shown. Repeated clicks can initiate/restart reads. |
| Access: Refresh members; Refresh permissions; create-project empty industry list: Refresh industries | **No in-progress acknowledgment or disable.** Read-only requests; empty state can remain visually unchanged while refreshing. |
| Load more: dashboard findings/pools, Pools list, pool agents, Activity requests, introspection runs | **Partial:** button disables with `isFetchingNextPage` but retains its label and has no action-local progress text. Failure uses the containing query's error state. Cursor reads create no persistent duplicates. |
| Explore schema and Entitlements tree: Load more branch | **Acknowledges by replacement:** action becomes “Loading this branch…”, then children; failed branch displays local error/retry. Does not literally retain a disabled button. Cursor state rejects adding the same cursor twice. |
| Explore schema and Entitlements tree: Try again branch | **Partial:** retry has no disabled/fetching binding; uses pending rather than fetching status. Error can remain unchanged during retry. |
| Shared ErrorState: Try again | **No explicit pending acknowledgment/disable in the shared control.** Used by loading failures throughout dashboard, tenancy, sources, observations, filings, catalog, entitlements, introspection, pools/twin, access, custody, settings, Activity/detail and session guard. Some callers replace the whole view with LoadingState; none passes pending state to this control. |
| Route error boundary: Try again | Synchronously resets the boundary and attempts to render the screen again. No work submission; subsequent reads use the screen's loading state. |
| Entitlements: View DDL; source filing disclosure; Access member disclosure; catalog/entitlement tree expansion | Expansion is visible immediately and newly requested content has a loading state. Toggle stays available to collapse. These are reversible disclosure/read controls, not submission commands; no duplicate domain objects. |

## Other controls accounted for

Drawer/switcher/breadcrumbs, links to scoped records, setup links, opening create/connect/rotate/revoke/restore dialogs, dialog Cancel/Dismiss, selection/cancel-selection, filters/search inputs, tabs, and local disclosure controls change UI or navigate immediately. They do not themselves submit a work command; the submitting controls are listed above. Automatic callback processing and Activity infinite scrolling are not clicked actions; scrolling checks the next-page fetching state.

Shell Notifications, Help and the drawer footer Your account are inert buttons without handlers. The shell search input has no search handler. These do not secretly queue work; they are separate unwired-control findings. The top account link does navigate to personal settings.

Workbench, vocabulary, source-of-truth, relationships, knowledge, releases and audit-log placeholder destinations contain no work commands. No invitation-management or evidence-export initiating control is currently rendered. The component kitchen sink is a demonstration route; its sample buttons/toasts are not production commands. API-only operations and background jobs are outside this UI audit.

## Evidence locations

- UI: `src/app/{sources,tenancy,pools,custody,entitlements,introspection,settings,activity,dashboard,access,catalog}` screen and data files; `src/app/auth-screens.tsx`, `src/app/shell.tsx`, `src/shared/ui/index.tsx`.
- Duplicate effects: `src/modules/tenancy/infrastructure/{company-creation-repository,project-creation-repository,industry-migration-repository,project-update-repository,settings}.ts`; settings SQL functions in migrations 050/051; `src/modules/sources/infrastructure/source-registration-repository.ts`.
- Replay protection: `src/modules/pools/infrastructure/keys.ts`, bulk entitlement request ledger, `src/modules/entitlements/infrastructure/key-custody-repository.ts`.
- Authentication issuance/consumption: `src/modules/identity/application/magic-link.ts`, `src/modules/identity/infrastructure/magic-link-repositories.ts`, OIDC service and routes.

## Verification of the two fixes

Browser tests cover delayed POST and list refresh, immediate disabled Starting state, a double-click issuing one request, a fast completion retaining its exact run receipt, action-local active-run refusal, archived exclusion and non-archived states. Landing is checked with a long demo source name for one-line left alignment. Existing visual cases cover 390/900/1440 and accessibility.

- `npm run test:visual:docker -- e2e/sources.spec.ts --project=functional`: **10 passed**. The new delayed-response test initially expected the receipt before mutation settlement; it now verifies the cached pending source while refresh is held, and the persistent receipt after refresh. No existing assertion was weakened.
- Source visual/axe cases at 390/900/1440: **9 passed** in the combined snapshot run. Updated ready/failure/conflict images were inspected; unrelated empty/wizard image churn was discarded.
- The **3 active-run conflict cases passed again** with an explicit viewport assertion on the run link after clicking, without scrolling the refusal into view.
- Expanded source filing visual/axe cases (`ING-27/29`): **3 passed** at 390/900/1440; unrelated dashboard image churn was discarded.
- `npm run typecheck`, `npm run lint`, `npm run build`: **passed**. Build retains its existing large-bundle warning.
- No database or migration changes; no full-suite claim. All audit findings outside the two source fixes remain unchanged.


## Follow-up implementation

The following pass addresses the three persistence findings and the partial/missing
acknowledgments. The tables above retain the audited before-state. Shell placeholders
and inert navigation controls are not being implemented as new features.

The required-key list and company creation endpoint coexist in the first committed
specification, `4337543` (item 1.1). Company payload detail arrives in `87746ef`,
but the endpoint was already present. Thus the omission was an incomplete original
list, not a feature added after the list. History records no rationale. There is
no later-added company endpoint to explain other omissions by that chronology.
Project/source creation have name uniqueness, invitations deliberately redeliver,
re-introspection deliberately starts later runs, and repeated magic links are
intentional. Token-key rotation already falls under the listed key rotation rule.
Restore remains a distinct deliberate operation, not added to the required-key
list in this change.

Migration 056 replaces the rename function with an unchanged-name guard and adds
actor/route-scoped company creation receipts. Applied migration 051 is unchanged.
Company retries reuse the original company and relationship outbox entry, including
a retry after grant dispatch failure. Industry migration remains serialized and
only increments when its target differs from the current industry.


Acknowledgment pass:

- Project, personal and company settings say Saving and keep errors/results beside
  Save. Rename and migration now use mutations, keep pending controls disabled,
  preserve the API refusal text, and wait for their declared invalidations. The
  migration publishes the returned industry into the cached project list so the
  displayed industry changes before its button re-enables.
- Demo connection, introspection cancellation, token-custody commands and bulk
  entitlement decisions show refusals beside their initiating controls. The bulk
  bar wraps and scrolls its local error details rather than putting them offscreen.
- Refresh, pagination, shared retries and clipboard copy show pending labels and
  stay disabled until their returned promises settle. AsyncButton has a synchronous
  guard, local pending state in Zustand, and current query refusal feedback. A
  successful retry clears a read refusal rather than leaving a stale copied error.
- Sign-in link requests and device confirmation retain their disabled controls
  with progress text and inline refusals. Provider start shows Starting sign-in
  until navigation. Callback completion has a disabled progress control. The
  project switcher and branch retries acknowledge their read; branch loading
  renders a disabled Loading control.
- No new CSS class or stylesheet edit. No changes to the magic-link server,
  rate limits, or deliberate repeated issuance. Inert shell placeholders remain
  outside this work; no new notifications/help/account feature was invented.

Verification:

- Four database suites: **44 passed**, including concurrent rename/migration,
  company replay, changed-body refusal, grant-dispatch recovery and table grants.
- Migration 056: **up, down, up passed** in the isolated test database; applied
  migration 051 is unchanged. The development database has not been migrated by
  these verification commands.
- Six UI unit/contract suites: **28 passed**, including shared promise completion,
  repeat-click suppression, inline refusal, authentication, settings and shell.
- Initial affected browser pass: **107 passed, 2 failed** out of 109. The two
  failures identified stale refresh feedback and duplicate Activity error text;
  both were fixed in production code without weakening their tests. The four
  Activity/Dashboard functional cases then **all passed**. The broad pass included
  the affected visual/axe cases at 390/900/1440. Unrelated ready-state screenshot
  churn from shell/timestamp presentation was discarded.
- Final catalog/entitlement/authentication/tenancy functional pass: **13 passed**;
  the new company-key test initially omitted its required region and made no
  request. With that form input supplied, its isolated rerun **passed**. These
  add explicit coverage for stable company keys and deliberate magic-link retry.
  All 111 distinct selected browser cases have passed across the initial pass
  and targeted reruns; this is not a claim of a single full-suite green run.
- Final strict typecheck, lint, build and `git diff --check`: **passed**. Build
  retains its existing bundle-size warning. No bypass or full backend suite was
  claimed for these tenancy and UI changes.
