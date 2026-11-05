# CONSOLE-03 — Identity, theme and custody credentials

Branch: `fix/console-followups-3`, based on main `67d8f14`. Not merged.

## Implementation

Certificate label and fingerprint prefix lead agent presentation in Pools, Home
and Activity. The nickname is secondary. Verified means the request authenticated
with its credential's bound certificate. Bearer-only connections are unverified.
New receipts record the public identity at request time. Historical receipts say
“certificate not recorded”; no existing evidence is updated. Retention and exports
carry the snapshot, and downgrade guards refuse to discard it.

Light, Dark and System are personal settings, defaulting to System. The account
menu saves the preference. A local mirror sets the root theme before the main
application loads; the server is authoritative after sign-in. Colour literals live
in the one tokens file; report bands use their own root tokens in either theme.

Settings → Custody · XQ has a write-only credential editor. The existing XQ health
check runs before storage. Project-bound AES-256-GCM encryption uses a domain-separated
key derived from the existing custody master key. Stored values override install
environment values. Status returns only set/not-set and change time. Live grants
use the existing count-confirmation and revocation operation. The audit entry
records the change without values. The POST route requires project administration.

## Evidence

Targeted validation: the 64-file migration/contract run passed 62 files; its two
fixture corrections then passed in the focused 3-file run (12 tests, including
the added credential permission test). The remaining migration-named files
passed separately (25 tests). All migration fixtures/up/down tests have passed.
Strict typecheck and lint passed. Console tests passed 170 tests. The subsequent
final UI run passed 169/170: the existing two-table OR editor case exceeded its
5-second guard (5,435 ms). Both AND and OR cases passed alone unchanged (2 tests,
5.17 seconds combined). No timeout or assertion was changed. This is evidence of
a non-reproducing timing failure, not proof of its underlying cause.

The standard production build and review capture passed (22.35-second capture):
no page errors and no failed HTTP responses. The development capture initially
used an obsolete proxy override and an incomplete checkbox selector; the final
harness uses production preview and the actual accessible label. No full gate
has run yet.

The initial targeted run exposed the missing certificate column in the retention/
export view; forward migration 103 corrects that without editing applied migrations.
The broad migration/contract run passed 62 files and failed two older migration
fixtures. One rolled 052 back while retaining later columns. It now rolls down to
052 using the version helper. The other created a new receipt with a certificate
snapshot before downgrading through 101; it now creates a historical-format fixture
through the writer, without editing an issued receipt or weakening the downgrade.

Coverage includes `credential-identity-binding.test.ts`, `mcp.test.ts`,
`evidence-lifecycle-migration.test.ts`, `evidence-export.test.ts`, `settings.test.ts`,
`release-custody-availability.test.ts`, `console-followups-migration.test.ts`, and
console foundations, workflows, Pools and Settings tests.

## Limits and interpretation

Credential-check tests stub the existing XQ provider health operation. They prove
check-before-store, refusal, encryption, precedence and permission behavior; they
are not a live-XQ tenant acceptance run. The implementation preserves the existing
check's coverage rather than claiming it independently validates every XQ field.

Screenshots are local isolated fixtures using real API routes, an injected fixture
administrator and local custody. They are not screenshots of the cloud deployment.
The committed capture script and fixture produce the review artifacts.

## Screenshots (1440 px, production build)

| Screen | Light | Dark |
|---|---|---|
| Home | [Light](console-followups-3/home-1440-light.png) | [Dark](console-followups-3/home-1440-dark.png) |
| Pools | [Light](console-followups-3/pools-1440-light.png) | [Dark](console-followups-3/pools-1440-dark.png) |
| Data | [Light](console-followups-3/data-1440-light.png) | [Dark](console-followups-3/data-1440-dark.png) |
| Settings | [Light](console-followups-3/settings-1440-light.png) | [Dark](console-followups-3/settings-1440-dark.png) |

[Capture responses and screenshot list](console-followups-3/capture.json).
Additional condition-builder screenshots show input and incomplete-condition
states in both themes. Text/state contrast and report-band graphical contrast
are tested in `foundations.test.ts`. The captured eight screen/theme combinations
were visually inspected; tokens remain legible on the dark band. The existing
condition-builder layout and truncated long Settings subtitles remain unchanged;
this task changes theme behavior, not those layouts.
