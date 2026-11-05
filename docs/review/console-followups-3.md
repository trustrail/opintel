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
harness uses production preview and the actual accessible label. The single full-gate result is recorded below.

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

## Single full gate — failed, no retry

Implementation candidate: `36a3c36d0e33b567a6b49bd33c79e64b08eab0bc`.
Command: `npm run check`. Exit 1; wall time 2,736.65 seconds.

- Preflight passed: Docker 7.75 GiB usable; PostgreSQL and Redis reachable; fresh
  gate database migrated from zero.
- Strict typecheck, conformance typecheck, lint and production artifact: passed.
- Control conformance: 38 passed, 28/28 screen routes, zero distinct findings.
- Normal tests: **2,306 passed, 1 failed; 271 files passed, 1 file failed**.
- Failed: `test/database-deadline-runner.test.ts:9`, `runner control: deadline`.
  Exact error: `Test timed out in 15000ms.` Reported test duration: 15,035 ms.
  The same file's lock and unconfirmed controls passed (6,314 ms and 1,100 ms).
- Smoke was **not reached**. No standalone smoke run or full-gate retry was made.
- Gate cleanup passed. No product change was made after this result.

The runner-control test and database runner are unchanged from main `67d8f14`
(`git diff 67d8f14...36a3c36 -- test/database-deadline-runner.test.ts
scripts/testing/database-runner.ts` is empty). Its 15-second guard includes the
child Vitest process startup. The observed fact is a timeout; the underlying
cause has **not been established**. This report does not classify it as an
environment failure or claim the gate passed.

All CONSOLE-03 targeted files also passed inside this gate, including identity
binding, MCP receipt snapshots, evidence retention/export, settings, credential
checks and the new migrations. `test/provisioning-runtime.test.mjs` passed 3 tests.

[Gate metadata](console-followups-3/gate.json) ·
[Failure and totals](console-followups-3/gate-failure.txt).
Full retained log: `/private/tmp/console03-gate-36a3c36.log`.

Implementation and screenshots were committed and pushed as `36a3c36` before the
gate. The closing report commit changes documentation/evidence only. Not merged.

## Authorized isolated diagnostics (2026-11-05)

On unchanged product revision `8a96b43`, the isolated database deadline runner
passed all three controls: deadline 5.941 s, lock 5.257 s, unconfirmed 0.941 s;
Vitest total 19.20 s. The subsequent standard smoke failed its 30 s deadline
(reported 31.8 s), with an MCP connection-closed error during teardown.
No concurrent build/test processes were found before those runs. That check does
not establish host-wide idleness.

The owner then authorized one smoke diagnostic with a 120 s test deadline.
`node scripts/console03-smoke-diagnostic.mjs` invoked the standard smoke harness
once, retained tracing on success, and restored `playwright.smoke.config.ts`
byte-for-byte. No assertion, product code, or gate deadline changed.

**Result: passed, scenario 35.7 s.** Per the owner's under-approximately-45-second
criterion, this is recorded as the known Intel deadline pattern. No additional
run was made. This classification is not a measured root cause; no comparable
pre-branch per-action timing trace was established in this diagnostic.

| Sequential scenario segment (trace boundaries) | Elapsed |
|---|---:|
| Sign-in through check-email assertion | 10.208 s |
| Callback and pool navigation | 5.156 s |
| Open, edit and save row rule | 4.785 s |
| Read decision, authenticated MCP query, persisted receipt assertions | 4.770 s |
| Open receipt and validate displayed evidence | 2.239 s |
| Open recorded row decision and assert its expression | 4.152 s |

These segments exclude fixture setup, teardown and gaps between traced actions;
they are not claimed to sum to Playwright's test duration. The MCP segment is a
wall-clock bracket from the saved-editor assertion to the persisted receipt
assertion, not a source-query-only measurement. Before hooks took 11.377 s
(including infrastructure beforeAll 3.107 s and browser connection 6.992 s);
after hooks took 3.077 s. Playwright total including build/setup/cleanup was
74.387 s; the complete standard harness invocation including Docker browser
startup/cleanup was 104.540 s. The ~45 s criterion applies to the scenario.

Every individual traced smoke action and its elapsed time is retained in
[smoke-120-actions.json](console-followups-3/smoke-120-actions.json), generated by
`scripts/console03-smoke-timings.py`. Full log:
`/private/tmp/console03-smoke-120.log`; raw trace and JSON reporter output:
`tmp/console03-smoke-120/`. Both diagnostic scripts are committed with this
record. Script syntax and repository lint passed. No full gate rerun or merge.
