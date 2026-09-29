# Item 5.14 implementation

Pools list, pool detail with key management, and agent twin are implemented.
They use the existing console classes; the master stylesheet is unchanged.
Pool detail and the twin are contextual destinations reached from their rows.
The Pools drawer item stays active; breadcrumbs link to the project, Pools and
specific pool, with the parent-only link at narrow widths. No screen adds a back
button.

The list shows query/prompt modes, bound-source count, agent counts, working-key
count and the clear ratio. The approved denominator includes every active element
in the pool's bound, non-archived sources, including undecided elements. Removed
objects/elements are excluded. Three clear out of 99 displays 3%; zero active
elements displays n/a. Existing pool-choice consumers retain their narrower
projection of the same cursor-paged endpoint.

The detail and twin use new project-view-authorized read routes. Key reads expose
metadata only, never credentials or hashes. Expired grace is evaluated at read
time. The twin's last-authenticated key status is separate from observed presence:
revocation can change the former without claiming the agent disconnected.
Disconnected twins retain first/last seen, client, reconnect count and key version.
Claimed identities are explicitly unverified and never authorize access.

Creation and rotation hold plaintext only in transient screen-local Zustand
state. Mutation results return no credential into TanStack Query's cache. A
successful clipboard copy, or copying the entire selected key, enables deliberate
dismissal. Escape and backdrop clicks do not dismiss. Internal navigation is
blocked while the action/key dialog is open; unload warns of loss. Dismissal
clears the credential; metadata-only replay explains that recovery is impossible.
The forms use React Hook Form and Zod as specified in §5.2.

Rotation states the grace duration, affected count and identities. Revocation
names the selected key version, requires the exact pool name, and lists
previously seen disconnected agents separately. The detail also reports agents
still on expired versions. These actions use the existing 5.2 implementation.

The approved §5.3 matrix now places rotation and revocation beside each other:
rotation invalidates pool.detail only; revocation invalidates pool.detail,
pool.lists and agent.presence. Tests assert those exact families. Identifier-only
presence notifications refetch affected agent queries and pool summaries;
reconnect snapshots refresh retained twins and pool summaries/details without polling or dropping rows.

## Verification

- Focused backend, cache and shell regression: nine files, 46 tests passed
  (29.91 seconds). Covers pool keys, durable presence, MCP claimed-ID authorization
  equivalence, entitlement reads, SSE, route credential scanning, shell navigation
  and the new read/cache tests. I-001 and I-015–I-022 are covered across these and
  the browser tests. The full repository suite and bypass suite were not rerun.
- Follow-up read-route and UI primitive checks: two files, seven tests passed
  (4.62 seconds). Checks declared project-view authorization, denied access,
  cross-project isolation, metadata-only responses, no-store headers, the final
  twin projection and existing UI primitives.
- Linux Playwright functional and visual run: seven tests passed (1.2 minutes).
  Tests copy failure/success, disabled dismissal, Escape/backdrop behavior,
  metadata-only replay, rotation impact, typed revocation, cached twin/list
  refresh, disconnected retention, SSE reconnect, expired-key impact, n/a and
  loading/empty/error/not-found states.
- All three screens, revocation and shown-once dialogs have screenshots at
  390/900/1440. Axe and horizontal-overflow checks pass at each width. Captures
  were visually inspected. Final visual refresh: three tests passed (1.0 minute), verifying monospace key text at all widths.
- Final reconnect/cache checks: two files, eight tests passed (10.90 seconds), including project-scoped pool-detail refresh after reconnection.
- Strict typecheck, lint/boundary checks and production build passed. The build
  reports the existing >500 kB bundle warning (622.80 kB before gzip).
- No schema migration or grant changes; migration up/down is not applicable.
  Database tests use the isolated test database. No development data was changed.

The first backend run found an internal projectId leaking into the twin's strict
wire projection; the public projection now selects only its declared fields.
The first cache-test fixture incorrectly supplied revocation fields in a rotation
response; it was corrected to use each endpoint's strict contract. The host
Chromium binary cannot run on macOS 13 with this Playwright version; browser
verification uses the repository's pinned v1.63.0-noble container instead.
