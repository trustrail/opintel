# Source re-introspection maintenance action

Data sources now offers Re-introspect on every non-archived source row for
administrators. Active/pending sources retain the action and let the server
refuse; submission disables duplicate clicks through the source-list refresh.
The existing failed-source Retry shortcut remains.

Both actions use `useRetrySource` and `POST /api/v1/sources/:id/introspect`, with
its existing `project#bind_source` permission, scope, schema selection, queueing
and invalidation behavior. Before this change, failed-source Retry was the only
UI caller. Connect and introspect uses source creation instead, and demo Connect
uses the from-demo route.

The existing conflict guard lacked a run identifier. Its response now names the
locked source's active run and includes `details.runId`; the UI validates that ID
and links to the exact run. It does not infer the target from a cached list row.
Archived sources remain refused by the server, with no new run or catalogue write.
No new route, migration or CSS class was added.

Verification: 17 source integration tests passed, including completed-source
re-introspection, conflict metadata and archived refusal. Seventeen browser cases
passed (eight functional, nine visual), including all source states and
390/900/1440 conflict views with axe. Typecheck, lint and build passed. Three additional expanded-source filing visual/axe cases passed, with snapshots
refreshed for the new table column. Their existing no-buttons assertion was made
specific to filing expanders: a live source now correctly has Re-introspect,
while still having no filing expander.

Follow-up: immediate Starting feedback, a persistent run receipt, action-local
refusals and Landing alignment are recorded with the application-wide action
audit in [action-acknowledgment-audit.md](action-acknowledgment-audit.md).
