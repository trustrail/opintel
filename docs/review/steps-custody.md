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
