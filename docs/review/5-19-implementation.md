# Item 5.19 — administrator SSO recovery

Company administrators retain magic links under enforcement only while they
administer every enforced company restricting the account. Domain, company or
project membership and live invitations identify restrictions; only existing
company administrator membership grants the exception. Project administration
and administrator invitations do not grant it.

Provider resolution returns the same enforced provider and recovery option to
every address at an enforced domain. The screen offers SSO and recovery without
automatically redirecting. Request-link keeps its ordinary 202 response for
administrators, members and unknown addresses; a denied request creates no token
or mail-outbox entry and dispatches no mail.

The required `MagicLinkAccess` port is constructed with `PostgresMagicLinkAccess`
in `start.ts` and supplied to both `MagicLinkService` and `CurrentUserService`.
It checks current restrictions before issuance, before either callback completes,
again before session release, and on authenticated magic-link session reads.
Loss of administrator status therefore invalidates outstanding links and revokes
sessions on their next authenticated read. OIDC sessions retain their existing
path. The original 1.10 issuance/confirmation gap is documented in `deferred.md`.

The existing append-only `audit_entry` records `SsoBreakGlassUsed` for each
restricting company at issuance authorization, completed sign-in and every
accepted session read. Issuance authorization names a system actor because an
email submission is not authenticated; subsequent events name the verified user.
Records carry a session fingerprint instead of a bearer cookie. Audit failures
fail closed; a session created before a failed final check is revoked before
release. No migration or evidence-table exception is needed.

Company settings explicitly states the administrator exception and auditing.
Both screen changes use existing stylesheet classes.

## Verification

- Expanded identity regression: **76 tests passed in ten files** (38.14 seconds),
  including all recovery layers, both confirmation paths, demotion, multiple
  companies, project-only administration, pending administrator invitations,
  audit failures, existing identity flows, the 5.18 gate and I-003 route scanner.
- Six Docker visual checks passed with axe and overflow checks at 390 / 900 /
  1440. Three company-setting captures were updated and three recovery captures
  added; narrow company and narrow/wide recovery captures were inspected.
- Strict typecheck, lint, production build and diff checks passed. The existing
  bundle-size warning remains. No full repository or bypass run is claimed.
- The host browser runner lacks its required Chromium binary; the separate
  company-settings disclosure and accessibility check passed in Docker instead
  (one test, 15 seconds).

## Enforced invitations and expiry

Enforced-provider delivery stays in 5.19. Creation stores one pending invitation
and enqueues `invitation` mail containing the company provider start path,
company id and invitation id. No magic-link token is created. The production
composition root now constructs `OutboxInvitationDelivery`; the existing mail
adapter renders the URL against the configured application origin.

OIDC already used the shared tenancy acceptance path. It now scopes invitation
lookup to the sign-in company, rejects mismatched email/company or expiry, and
passes the pinned provider identity and revision to acceptance. The acceptance
transaction independently checks company ownership, enabled configuration and
revision. A platform provider cannot accept an enforced invitation.

Both callbacks create their session and finish their sign-in checks before
calling acceptance. Provider, session or configuration failures therefore leave
the invitation pending with no membership. A failed acceptance transaction
revokes the prepared session. Acceptance now awaits the authoritative relationship
write while holding the invitation transaction open. Membership, accepted_at and
the outbox entry commit only after SpiceDB returns its revision; the entry is
committed already marked written. A dispatch failure rolls back all three.
The ordinary post-commit outbox dispatcher is unchanged for other commands.

Consumed magic-link tokens stay consumed, including after failed acceptance.
The refusal explicitly asks for a new link. Request-link finds the still-pending
invitation even though the account now exists, attaches a fresh token, and sends
it through the existing delivery port. OIDC instead starts a new provider flow;
the previous callback state stays consumed. Neither failure releases a session
cookie, and the prepared session is revoked.

This is ordered coordination, not a distributed transaction. A lost SpiceDB
acknowledgement or a database commit failure after a successful remote write can
still leave a relationship without its Postgres row. This residual divergence
is recorded in deferred.md; no repair job is invented here.

Expired invitations are retained and returned by the cursor API with
`status: expired`; unexpired outstanding invitations are `pending`. No diagnosis
is inferred for a sign-in that did not complete. Item 5.19b owns the missing
invitations UI, retained revoked state and resend action; no UI was built here.

Earlier intermediate runs exposed the old post-commit ordering assertion.
The updated regressions now require no committed membership or outbox entry
during the relationship write, rollback on failure, and a written revision on
success. They exercise both magic-link callback variants, HTTP request-link and
fresh-token delivery after failure, and the production OIDC routes with a real
Redis session. Old-token and old-callback replay remain refused.


### Acceptance-ordering verification

The eleven-file identity/invitation regression passed 80 of 81 tests in 33.70
seconds. The remaining B-015 test still constructed InvitationService with its
removed outbox argument; its setup was corrected without changing assertions.
The complete magic-link file then passed all 11 tests in 13.84 seconds.
The new tests passed for both magic-link callback variants and OIDC: rollback of
all three database changes, revocation of the prepared session, refusal text,
fresh-link delivery through HTTP request-link, successful recovery, and rejection
of old-token/old-callback replay. Successful acceptance records the outbox revision.

Strict typecheck, lint and diff checks pass. No migration, handwritten scope,
CSS or frontend change was needed for this correction. The npm test wrapper
started a full run because it adds the broad `test` filter; that run was stopped
and replaced with the explicit eleven-file Vitest run above. No full-suite or
bypass result is claimed for this correction.
