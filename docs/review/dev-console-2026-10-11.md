# Dev console diagnosis, October 11

Both Vite listeners were previous dev sessions: PID 9500, October 6 18:16:48, on 5173; PID 90133, October 7 18:35:02, on 5174. Both ran `node /Users/rzarita/opintel/node_modules/.bin/vite`, cwd `/Users/rzarita/opintel`. Neither was started by today’s gate. Both were stopped; the old stopped 5173 process required KILL after TERM failed to release the listener. One replacement console now listens on 5173. Vite now explicitly sets port=5173 and strictPort=true; the occupied-port failure was observed before the old listener was removed.

The API had APP_BASE_URL=http://localhost:5173 (also its default). This supplies magic links and OIDC redirects; it is not a CORS/origin allowlist. No origin rejection handler exists for these routes. The cookie is `opintel_session=<redacted>; Path=/; HttpOnly; Secure; SameSite=Lax`, no Domain, and no port (cookies do not have a port attribute). Vite proxies /api to the API, making each console’s requests same-origin. The log contains no rejected-origin line: it contains the SQL exception stacks below. Authenticated diagnostic replays with Origin http://localhost:5174 returned 500, not 401/403, for both `/api/v1/projects/de000000-0000-4000-8000-000000000003/dashboard/feed` and `/custody-provider`. Both envelopes were internal_error, “An unexpected error occurred.”, retryable=false. Diagnostic request ids: dashboard 58440581-aba1-407d-add8-3399d81a08a9; custody 14df0afb-eda8-4232-9f42-4162c425185a.

## Actual console API log records

The production sanitiser intentionally withholds the native message/type. These are the retained records; the full native error cannot be recovered from those logs. The native SQL failure was independently reproduced read-only using the same platform scope, not inferred from the stack.

```json
{
  "event": "http.request_failed",
  "requestId": "0a14a860-3f8e-49db-ad3a-1e52dcb5e27a",
  "type": "[exception type withheld]",
  "message": "[exception message withheld]",
  "stack": [
    "at [stack frame location withheld]:694:17",
    "at [stack frame location withheld]:95:5",
    "at src/platform/db/scope.ts:20:13",
    "at src/platform/db/scope.ts:37:20",
    "at src/modules/release-custody/infrastructure/availability.ts:15:14",
    "at src/modules/tenancy/infrastructure/dashboard.ts:22:80",
    "at src/modules/tenancy/api/dashboard-routes.ts:16:15",
    "at src/platform/http/server.ts:312:22"
  ]
}
```

```json
{
  "event": "http.request_failed",
  "requestId": "965e19de-b266-4243-9e8c-c99c6c8c2f8a",
  "type": "[exception type withheld]",
  "message": "[exception message withheld]",
  "stack": [
    "at [stack frame location withheld]:694:17",
    "at [stack frame location withheld]:95:5",
    "at src/platform/db/scope.ts:20:13",
    "at src/platform/db/scope.ts:37:20",
    "at src/modules/release-custody/infrastructure/availability.ts:15:14",
    "at src/modules/release-custody/infrastructure/runtime.ts:92:47",
    "at src/modules/release-custody/api/routes.ts:7:248",
    "at src/platform/http/server.ts:312:22"
  ]
}
```

## Reproduced native failure

SQL: `SELECT settings,custody_check FROM project WHERE id=$1` with the named project id. Native name `error`, SQLSTATE `42703`, message `column "custody_check" does not exist`.

```
error: column "custody_check" does not exist
    at /Users/rzarita/opintel/node_modules/pg/lib/client.js:694:17
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async Object.query (/Users/rzarita/opintel/src/platform/db/scope.ts:20:13)
    at async run (/Users/rzarita/opintel/src/platform/db/scope.ts:37:20)
    at async file:///Users/rzarita/opintel/[eval1]:4:69
```

No SpiceDB call failed. Running API inherited DATABASE_URL localhost:5432/opintel and SPICEDB_ENDPOINT localhost:50051. Direct database query confirmed current_database=opintel, server port5432. These are the original dev services; normal isolation substitutes only its child-process SpiceDB endpoint and resets only opintel_test. Neither `.env`, scripts/dev-environment.ts nor docker-compose.yml was changed by that work. `.env.example` has the documented 5.36 custody variables added, with no replacement database/SpiceDB values. Dev ReadSchema definitions/relations/permissions match docs/opintel-schema.zed after canonical ordering, whitespace and comments are accounted for; no schema write was needed.

Before: last three applied migrations 066 observation_history; 065 relationship_review; 064 token_history_write_denial. Missing 067–071 were applied via the migration runner without editing migration bytes. After: 071 release_revocation_reason; 070 release_provider_check; 069 release_derived_signing. API restarted, listening on3000. No 5.36 feature code patched.

Authenticated responses through http://localhost:5173 afterwards: dashboard/feed200 (four quarantine findings, nextCursor=null); custody-provider200: provider=null, available=false, reason=provider_not_configured, checkedAt=null, API/dashboard keys not set, signingKeyId=null, affectedColumns=0. Provider not configured is a valid state, not a load failure.

Gate teardown: Playwright owns the4173 webServer in its Docker container, CI=1 disables reuseExistingServer; docker run uses --rm --init. Inspection after exit found no4173 listener and no browser container, only Postgres/Redis/SpiceDB dev service containers. The gate must leave no dev servers behind; this rule and finding are recorded in deferred.md.
