# Item 5.18 — completed-sign-in enforcement gate

SSO enforcement now refuses until the enabling actor has completed a sign-in
through the exact enabled company provider configuration. The company settings
route retains its `company#administer` permission. The proof check and settings
write share the company row lock with provider mutations; refusal returns a
human-readable conflict, leaves enforcement off, and records an audit fact.

Forward migration 055 adds persisted scope (existing behavior: `openid email
profile`), a trigger-managed configuration revision, and per-user completed
sign-in proof. It does not infer proof from existing identities or discovery.
Any changed provider row receives a new revision; changing it back does not
restore proof. Configuration UPDATEs under enforcement refuse. Existing
provider-count constraints continue to guard provider deletion/addition.

Sign-in pins the configuration snapshot at start. Callback verifies the revision
before exchanging and exchanges with the pinned snapshot. After session creation
it checks again under the company lock before recording proof. A configuration
change during exchange refuses completion and revokes the new session. No proof
is written for a failed exchange, unverified email, failed session creation or
stale revision. Provider identifiers are normalized once, avoiding
`oidc:oidc:generic` session methods. The adapter uses persisted scope.

Two-phase replacement remains item 5.18a; break-glass remains 5.19. Neither is
implemented here. Existing enforced companies are not silently disabled or
backfilled with assumed proof.

## Item 1.9 wiring prerequisite

The API now constructs the production OIDC service through `createOidcRuntime`,
using the Postgres configuration/identity repositories, Redis flow/session stores
and OpenID adapter. It registers the specified start and callback routes. Vite
proxies `/auth/oidc`; company links identify their configuration, and the SPA
carries its device nonce. A secure HttpOnly flow cookie binds callback state to
the initiating browser; the callback provider must match the flow. Redirects use
`APP_BASE_URL`, never arbitrary request hosts or return URLs. A successful
callback sets the session cookie and redirects to projects. Pending invitations
are resolved by the verified email when no invitation id was supplied.

Platform Google/Entra credentials are explicit environment-backed configurations
with secret references, documented in `.env.example`. A platform sign-in never
establishes proof for a company configuration. No external IdP credentials were
available for a live provider test; the HTTP reachability test mocks only the
external provider authorization/exchange and uses the real production factory,
Postgres repositories and Redis flow/session stores.

The composition-root audit and the distinction between missing administrator
controls and superseded helpers are recorded in `deferred.md`. No unrelated
missing control was wired as part of this item.

## Verification

- Item 1.9 wiring gate: **16 tests passed in five files** before the 5.18 changes.
- Final identity regression: **91 tests passed in 15 files** (55.92 seconds),
  including the production-factory HTTP round trip, 5.18 proof/invalidation/race
  cases, company permission enforcement, migration 055 down/up, grants/RLS,
  settings, invitations, magic links, Redis sessions and sign-in screen tests.
- Strict typecheck, lint (including dependency boundaries), production build and
  diff checks passed. No CSS classes or visual markup changed.
- Verification used a freshly created disposable database migrated through 055;
  existing development and isolated test databases were not reset or migrated.
  No previously applied migration was edited.
- The full repository and bypass suites were not rerun for this identity-only
  change. No live external IdP round trip is claimed.

## Route-factory construction correction

The focused identity regression omitted I-003's all-route schema scanner. It
found `oidcRoutes` parsing `appBaseUrl` during factory construction, although
discovery deliberately supplies stub dependencies and never runs handlers.
URL parsing now happens inside the start and callback handlers. The scanner
remains unchanged and passes (one test, 4.68 seconds); route discovery performs
no configuration parsing or service execution.

## Platform provider visibility correction

Platform defaults previously appeared without usable credentials, both in
provider resolution and as hard-coded sign-in buttons. Resolution now checks
issuer, client id and secret-reference resolution through a narrow readiness
port on every request. Missing or unresolvable configuration omits the provider;
the response contains no credentials and is marked `Cache-Control: no-store`.
Enabled company providers retain their existing behavior.

The screen requests the configured platform list without an email on initial
load, then resolves company providers after a valid email is entered. With no
OIDC configuration, the API returns magic link only and neither platform button
appears. The existing environment secret adapter is unchanged: development
loads `.env` at process start and requires a `dev:api` restart after editing it.
There is no OIDC-specific file reread or startup visibility cache.

Verification of the final visibility change: **47 tests passed in nine files**
(28.16 seconds) against a fresh disposable database, including the no-OIDC
HTTP response and screen, repeated resolution with changing availability,
credential non-disclosure, I-003's unchanged scanner, and OIDC/proof regressions.
Strict typecheck, lint and diff checks passed; the production frontend build
also passed. The full repository and bypass suites were not rerun.
