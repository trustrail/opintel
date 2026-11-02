# MCP agent ID URL parameter

Branch: `fix/agent-id-param`, based on main `45ab120`.

The MCP endpoint accepts the existing `X-Opintel-Agent-Id` header or the
`agentId` URL parameter. Both values use `AgentIdHeader`; matching values are
accepted, conflicting values are refused with a message naming both sources,
and missing or invalid values are refused. Ambiguous repeated query parameters
are rejected. This applies to initialization, subsequent requests, event-stream
requests, session deletion and heartbeat presence.

Credential verification still happens first. The pool key remains the only
membership credential. The resolved ID enters the existing principal and
presence/receipt paths; there is no source-dependent evidence or presence field,
and the ID remains self-declared and unverified. Receipt storage and log event
shapes are unchanged. No migration or permission change is needed.

The transport OpenAPI contract declares both parameters optional individually,
explains their relationship, and retains the `pool-key` permission. The agent
panel reuses its existing fixed rows to display the header and encoded URL.
The packaged gateway README documents both forms and keeps the credential in
the authorization header.

## Targeted validation

- MCP transport, contract, query, presence, describe and explain: 80 tests passed
  across 6 files. Includes header-only, query-only, equal/conflicting IDs,
  missing/blank IDs, ambiguous query values, bad-key precedence, SDK heartbeat
  presence and a full initialized query-only session with the ID persisted on
  its receipt and presence record.
- Console: 154 tests passed across 13 files. The sandbox run emitted blocked
  localhost asset-request diagnostics; the same suite also passed with normal
  host permissions.
- DEP-008 provisioning runtime contract: passed.
- Strict typecheck: passed.
- Unchanged lint and dependency-boundary checks: passed (no violations).

## Completed-candidate verification

One full gate and fresh amd64 packaged first-receipt acceptance are pending.
The packaged acceptance uses the existing `console-first-run-install.mjs`
harness without replacement sign-in, HTTP or TLS steps. ARM native verification
is run separately on the MacBook Air.
