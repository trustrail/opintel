# Agent custody steps

Branch `feat/steps-custody`, from main `f744476`.

## Scope and decisions

The gateway archive ships `./steps sign-in`, `grant-access`, `query`, and
`redeem-and-unseal`, each performing one job with explicit flags and help.
Sign-in uses the normal nonce-bound magic-link request/callback and verifies
the created session. Grant access requires that normal session file and calls
the existing administrator credential-issuance API. It never creates an
administrator bypass. Query and redemption use one authenticated MCP session
per invocation and the self-declared agent ID URL parameter; the pool credential
remains the authorization identity.

The optional console XQ choice lists device names and certificate IDs from a
new cursor-paginated, project-administrator-only read endpoint. The public
association is sent through the existing issuance API. Credential rows and
agent detail show the linked device; unlinked credentials retain their previous
behavior and agent names remain self-declared.

The approved identity-import exchange runs in a separate short-lived agent
process. Only certificate ID, device name and the exact XQ-issued recipient
identifier are published. Gateway API services mount that public manifest only;
no device private/transport key is mounted there or stored in the database.
Production import/exchange runs on the agent's host. The gateway accepts only
the resulting public association. The new packaged acceptance reproduces that
boundary with a separate agent archive, without installing gateway services in
it. API-key extraction is an offline job with no device files; the agent receives
only the general XQ API key file, never gateway database or sender credentials.

The XQ exchange/fetch and local-unseal implementations were moved from the soak
into shared agent infrastructure. The soak still calls those implementations;
its fixture expectations and checks remain. The retained VERIFY-01 executor
already consumes the same soak custody-agent interface, so no parallel verifier
crypto implementation was introduced.

Output files are mode 600 and create-only; inputs reject non-private modes and
symlinks. Device keys and device access tokens stay in the isolated agent
process. Shares are transient, never output or persisted. Every required share
is obtained before any cell is decrypted. Query displays custody cells shortened
but saves complete sealed values/grants when requested. Redemption prints
plaintext only with `--show`; the explicit plaintext output file is private.
Receipt state `redeemed` retains the existing meaning: Opintel released K2. It
alone does not prove XQ retrieval or local decryption. Revocation is demonstrated
on a fresh unredeemed grant separately from the anti-replay check; previously
obtained plaintext cannot be recalled.

Per the approved interim choice, treatment labels use describe only for exact,
direct-column matches. Unresolved expressions/aliases say “not reported”. The
recorded-output-treatment/OAP leakage-gate design is in the master backlog.

## Validation

Targeted validation passed:

- 61 tests across 13 backend, command, credential, release, installer and package
  contract files; subsequent final command/identity/runtime regressions passed
  19 tests across 4 files, and the final diagnostic tests passed 15 across 2.
- All 156 console tests; a final 48-test Pools/workflow run after the display
  adjustment also passed.
- All six existing standalone soak custody-agent/oracle tests passed unchanged.
- Strict typecheck, unchanged lint/dependency checks, Node syntax checks and
  Bash syntax checks passed.

During development, a permission-test mock incorrectly expected administration
before the HTTP framework's prerequisite view check; the test now exercises both
checks and verifies the denied administrator check cannot read the manifest.
A callback union narrowing error and seven ordinary lint diagnostics were fixed
without changing typecheck/lint rules or governance assertions.
Targeted checks include the new command/permission/manifest tests, existing
credential and release contracts, unchanged agent custody oracle tests,
provisioning runtime exclusion, installer and package contracts, console tests,
strict typecheck and unchanged lint. A single completed-candidate full gate is
required, followed by fresh amd64 archives and the standard first-run acceptance
with `--custody` against the live XQ tenant. ARM native verification is a separate
operator run; no merge is authorized.

## Completed-candidate gate: stopped

Candidate `5ead8ae530446d041b6d81043eacbf349fe11252` was committed and
pushed before its single gate run:

```sh
COMPOSE_PROJECT_NAME=opintel npm run check
```

The gate exited 1 after 2322.58 seconds. Both typechecks, unchanged lint,
production-artifact exclusion, all 38 conformance checks (28/28 screen routes,
zero findings), and all 2253 normal tests across 267 files passed. This includes
the 12 step-command regressions, three identity-listing tests, provisioning
runtime, certificate association and V-01 conformance.

The final browser/MCP smoke test exceeded its unchanged 30000 ms test timeout:

```text
e2e/smoke.spec.ts:26:1
sign in → pool → row filter → authenticated MCP query → persisted receipt decision
Test timeout of 30000ms exceeded.
McpError: MCP error -32000: Connection closed
```

The connection-closed stack points to the MCP fixture's cleanup
(`test/fixtures/query/fixture.ts:104`, `e2e/smoke.spec.ts:25`). Retained logs show
the query had reached the engine; they do not establish the cause of the
whole-test deadline overrun:

| Event, UTC 2026-11-02 | Time |
|---|---|
| `/execute` attempt 1 started | 23:58:16.555 |
| TCP connected (DNS skipped) | 23:58:16.559 |
| TLS completed | 23:58:16.564 |
| Request written | 23:58:16.566 |
| Engine admitted request | 23:58:16.587 |
| Response-phase abort, `ABORT_ERR`, written=true | 23:58:17.143 |
| MCP refusal `source_unavailable`, cause `parent_cancelled` | 23:58:17.147 |
| Engine respond phase aborted | 23:58:17.155 |
| Engine validation ended; `execution.refused` logged `budget_exceeded` | 23:58:17.369 |

Call ID: `ac84c387-10ff-48a2-ab5a-2517bee0cc81`. Evidence ID:
`01a19eb3-0b49-7088-9373-85df6ac4b782`. TCP took 4.28 ms and TLS 5.42 ms;
the attempt lasted 588.00 ms. These records show cancellation after the request
was written, not a connect timeout. No product cause is inferred from them.

Gate summary: [gate-5ead8ae.json](steps-custody/gate-5ead8ae.json).
Full local log: `/private/tmp/steps-custody-full-gate-5ead8ae.log`, especially
lines 222069–222072 (normal results), 222320–222419 (cancellation), and
222422–222459 (smoke failure). Playwright retained its trace under
`test-results/smoke-sign-in-→-pool-→-row-9001e--persisted-receipt-decision-smoke/`.

Gate database cleanup succeeded; development Postgres and Redis remained
healthy. Per the stop rule, no gate or smoke retry, fresh archive build,
packaged install, or live-XQ demo was run after this failure. The requested
packaged terminal-output proof and native verification remain unverified.

## Authorized smoke comparison and gate acceptance

After the stop report, the owner authorized only the standard browser/MCP smoke
tier on main `f744476`, followed immediately by candidate `5ead8ae`, in the same
main checkout on the same Intel Mac. No code, timeout, test or dependency was
changed between these runs. Development Postgres and Redis were healthy.

Both commands were `COMPOSE_PROJECT_NAME=opintel npm run test:smoke`:

| Revision | Result | Test body | Playwright total |
|---|---|---|---|
| Main `f744476` | 1 passed; exit 0 | 14.7 s | 35.4 s |
| Candidate `5ead8ae` | 1 passed; exit 0 | 11.7 s | 29.0 s |

Retained logs: `/private/tmp/steps-custody-smoke-main-f744476.log` and
`/private/tmp/steps-custody-smoke-branch-5ead8ae.log`. The test-body deadline
remained 30 seconds; Playwright total includes setup/teardown outside that body.

**Decision:** accept the full gate on `5ead8ae` with this smoke evidence, exactly
as authorized: all earlier tiers passed in the original single gate, and smoke
then passed on both revisions back to back. No second full gate was run. The
earlier timeout did not reproduce; its underlying cause remains unestablished.
The Intel smoke-deadline review is recorded in the master backlog without an
implementation change. Continue with fresh amd64 archives and the existing
packaged first-run harness with its committed live-XQ custody extension.

## Fresh image build input correction

The first fresh amd64 build at `f833d8d` stopped before archive creation or
packaged acceptance: `provisioning-build` could not resolve
`scripts/steps/main.ts`. Its Docker stage copied `scripts/operator/` but omitted
the new `scripts/steps/` input (`deploy/engine/Dockerfile:45–47`). The host
provisioning-runtime test had the full checkout available and therefore did not
exercise this Docker build context boundary.

Corrected the build inputs only: copy `scripts/steps/` into provisioning-build
and demo-tools-build, the latter because the existing soak now imports the
shared custody implementation there. No product behavior, timeout, retry,
credential boundary or smoke test changed. Run the existing provisioning,
image-build and package contracts, strict typecheck and lint before committing
this packaging correction and rebuilding through the standard harness.

These checks passed: 22 tests across four files (provisioning-runtime,
image-build, image-build-plan, deployment-packages), strict typecheck and
unchanged lint/dependency checks. No additional full gate was run for this
Docker build-input correction.

The next build, `c57b774`, exposed a second missing transitive input:
`scripts/infrastructure/xq-token-unwrap.mjs` and
`xq-device-certificate-envelope.mjs`. Added the existing infrastructure folder
to provisioning-build as well. Strengthened the existing provisioning-runtime
test to construct its build context from the actual toolchain and provisioning
Docker COPY inputs, rather than the full checkout; it removes that context
before checking isolated command startup. The four targeted contract files
passed all 22 tests with this isolated build context. These are build-input and
test corrections only; packaged acceptance has still not started.
