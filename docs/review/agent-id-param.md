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

Candidate: `bad97aa7b5a8ef7c8516b76830e257e1f8e1ab46`. The full gate ran
**once**, passed all seven tiers, and completed cleanup (2,309.71 s): strict
typecheck, conformance typecheck, lint, production-artifact checks, 38 browser
conformance checks (28/28 routes, zero findings), 2,238 normal tests across 265
files, and the browser/MCP smoke path. [Gate result](agent-id-param/gate.json).
Log: `/private/tmp/agent-id-param-full-gate-bad97aa.log`.

The standard image build verified all seven `linux/amd64` images, their layers,
runtime allowlists and runtime-user readability. [Image identities](agent-id-param/images-amd64.json).
Candidate mode preserves the unrelated pre-existing untracked files in this
checkout; tracked application files were clean throughout verification.

Commands, sequentially (no substitute harness or client):

```sh
BUILD_CANDIDATE=1 TAG=candidate-agent-id-bad97aa PLATFORM=linux/amd64 IMAGE=all node scripts/images/build.mjs
PLATFORM=linux/amd64 node scripts/images/customer-package.mjs tmp/images/releases/candidate-agent-id-bad97aa-api-engine-console-egress-migrations-provisioning-demo-tools.json tmp/agent-id-bad97aa-packages --candidate
node scripts/images/console-first-run-install.mjs tmp/agent-id-bad97aa-packages bad97aa7b5a8ef7c8516b76830e257e1f8e1ab46
```

One fresh packaged acceptance passed, exit 0, in
`tmp/console-first-run-acceptance-hvwI7n`. The archives installed, the engine
paired with one code, and the ordinary source reference was saved with
`./sources add`. The browser passed owner SMTP sign-in, project creation,
engine registration/verification, source connection/scan, query limits, pool
creation, explicit column decision, credential issuance, an answered MCP query,
and its persisted receipt visible in Activity: “Answered · 6 rows from table
records”. It recorded the permanent first-receipt marker, checked the per-table
editors, and reported **zero browser errors**. The harness finished cleanup;
only the healthy development Postgres and Redis containers remained running.
[Acceptance result](agent-id-param/packaged-install.json),
[archive checksums](agent-id-param/archives-sha256.txt).

The standard packaged harness uses the existing header connection path. The
query-only initialized session and persisted receipt/presence are covered by
the real HTTP/SDK integration tests, both targeted and in the full gate. An
AuthZed OAP client itself was not run.

No application code changed after the validated candidate. The final follow-up
commit records results only. No merge was performed.

## MacBook Air

Run native arm64 verification for the exact application revision tested above
(default two-minute soak):

```sh
git fetch origin fix/agent-id-param
scripts/release/native.sh bad97aa7b5a8ef7c8516b76830e257e1f8e1ab46
```
