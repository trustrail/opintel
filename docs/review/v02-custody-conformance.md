# V-02 — Device-certificate custody conformance

Version: 2 · 2026-10-18

**Current live outcome: the approved two-certificate V-02 passed all 40 checks on
2026-10-18. Earlier blocked attempts are retained below as history. The full gate passed once.**

Extends V-01 on main (`d9f1733`); no parallel data fixture and no product source changes.
The existing reinsurance definition supplies twelve policies, twelve claims, two cedants,
three objects and ten independently issued pool credentials. V-02 adds public certificate
associations and changes Pool A's `risk_code` decision from clear to custody. In the approved
two-certificate run, Pool B's original mask is checked first, then its `risk_code` also
becomes custody to produce a B-addressed result for the reverse refusal check. All row
predicates remain unchanged. Expected plaintext comes from the fixture definition, never
from a query result.

## Original boundary and execution — historical three-certificate setup

Only `scripts/conformance/v02-agent.mjs` reads the bundles in `~/.xq/v02/` and holds
certificate private keys, transport keys and device tokens. The Application process sends
MCP connection details to that child and receives only public associations, sealed results,
and verification facts. Its child environment contains the General API key, not the owner
sender or dashboard tokens. Bundles were extracted in place; directories are mode 700 and
files mode 600. No certificate material is copied into the repository.

Each certificate is exchanged once, with a fresh XQ `/time`, the proven base64-of-full-PEM
`crt`, bare standard-base64 AES-GCM body, and no bearer on certificate authorization.
Recipient identifiers are taken from the issued token, stored verbatim by the existing
credential registration service, and masked in this report. The fixture uses 224 for four
Pool A credentials, 226 for its fifth, and 225 for all five Pool B credentials.

Escrow uses the production adapter and type 8. A delegating observer records only a SHA-256
digest of K1 for comparison with the agent's independently fetched share; it neither replaces
escrow nor returns an expected share to the agent. Each non-recipient fetch precedes the
rightful recipient fetch, so single-use consumption cannot explain a refusal.

Assertion 6 has an explicit fault-injection precondition: the remote-revocation transport
throws an unavailable error. The real administrator revocation service still runs, commits
K2 disposal and pending cleanup, and MCP redemption must refuse. Escrow and the subsequent
XQ fetch are real. This establishes local refusal while K1 remains retrievable, without
claiming that a naturally occurring XQ outage was observed. No cleanup sweep is run.

Command (live, opt-in; never part of the normal gate):

```sh
OPINTEL_V02_LIVE=1 npm test -- --config vitest.v02.config.ts
```

The harness creates an exclusive attempt marker under `test-results/v02/` before live work.
It stops at the first failed assertion and has no automatic retry. Device tokens, shares,
locators, literal recipient identifiers and TeamID are excluded from the persisted report.

## First attempt — 2026-10-17 (historical)

**Blocked — 2026-10-17 America/Toronto (2026-10-18 UTC).** Base commit `d9f1733`.
The live test failed in 11.36 seconds (test body 6.70 seconds). Certificate 225 returned
HTTP 403. The harness stopped; certificate 226 was not attempted. No packet was created,
no share was fetched or redeemed, and no fixture credential association was persisted:
certificate setup precedes the fixture. The 224 token was held only in the child process,
which exited at the end of the attempt.

| Setup | Expected | Actual | Result |
|---|---|---|---|
| Certificate 224 / `opintelpoola` | Successful exchange and provider-issued identifier | HTTP 200; token unwrapped; `opintelpoola_crt_224@<team>.trusted.local` | Pass |
| Certificate 225 / `opintelpoolb` | Successful exchange and provider-issued identifier | HTTP 403 | Fail |
| Certificate 226 / `opintelagentc` | Successful exchange and provider-issued identifier | Not attempted after 225 refusal | Not run |

| Assertion | Expected | Actual | Result |
|---|---|---|---|
| 1. Sealed result | One grant; custody sealed; other treatments unchanged | Blocked by certificate 225 refusal | Not run |
| 2. Opintel redemption | K2 released once; replay refused | No grants created | Not run |
| 3. XQ retrieval | Own device fetch returns the escrowed K1 byte for byte | No packets created | Not run |
| 4. Unsealing | Both shares recover fixture values; neither alone works | No shares obtained | Not run |
| 5. Recipient isolation | 224 → 226 and 226 → 224 fetches both refused | No fetches attempted | Not run |
| 6. Revocation | K2 disposed and redemption refused while K1 remains at XQ | Fault injection was not reached | Not run |
| 7. Evidence | Timed Opintel release; no literal values or claim of agent reading | No custody receipts produced | Not run |

The HTTP 403 establishes a certificate authorization refusal, not its cause. The provider
failure body was not retained by this harness; no claim about IP, country, certificate state
or team policy follows from the status alone. No diagnostic repeat was made.

Calls, in order (UTC):

| Time | Subscription operation | HTTP |
|---|---|---|
| 2026-10-18T03:46:05.005Z | `/v2/time` | 200 |
| 2026-10-18T03:46:05.859Z | `/v2/authorize/certificate/224` | 200 |
| 2026-10-18T03:46:08.793Z | `/v2/time` | 200 |
| 2026-10-18T03:46:09.026Z | `/v2/authorize/certificate/225` | 403 |

Local checks before live execution: typecheck and lint passed; V-01 and existing MCP custody
regressions passed (2 tests, 78.28 seconds). The blocked live run is not a gate pass or a
completed V-02. No full gate was run with this failed prerequisite outstanding.

Machine-readable run record: `test-results/v02/report.json`; one-attempt guard:
`test-results/v02/live-attempt.json`. Both are local artifacts. The safe facts are preserved
above. No token, share, locator or literal provider recipient is recorded here.


## 2026-10-18 continuation — certificate diagnostics and partial custody run

The authorized sequence continued after the first refusal, preserving the previous record.

| Certificate | Device name | HTTP | Full failure body |
|---|---|---|---|
| 226 | `opintelpoolb` | 200 | Successful encrypted token response; secret-bearing body redacted |
| 225 | `opintelpoolb2` | 403 | `{"status":"The requested certificate is not authorized for your current location"}` |
| 224 | `opintelpoola` | 200 | Successful encrypted token response; secret-bearing body redacted |

The new provider identities are `opintelpoolb_crt_226@<team>.trusted.local` and
`opintelpoola_crt_224@<team>.trusted.local`. Each was associated with its pool's five
credentials. No association was derived from a naming convention.

The unchanged ten-agent row checks passed, as did Pool B's original masking check. To
produce a B-addressed result for the reverse refusal assertion, the harness then changes
Pool B's `risk_code` to custody too. This is a fixture decision, not a product change.

One real type-8 packet was escrowed. Pool A returned six sealed values with one grant;
clear, masked, tokenized and withheld behavior checks passed. **No FetchKey HTTP request
was sent**: an erroneous harness guard expected the subscription URL, whereas SDK 2.0.6
`FetchKey.js:39` uses `VALIDATION_SERVER_URL`. The guard rejected that URL locally. The
agent's cleanup discarded the in-memory device tokens. This is a harness defect, not an
XQ recipient-binding result. The guard now uses the SDK's validation URL; no endpoint was
invented or tried as a workaround.

The failed test also reported database cleanup not confirmed and two PostgreSQL 57P01
connection-termination errors during teardown. Those are retained as secondary harness
failures; they are not evidence about XQ or custody. Total test invocation: 32.80 seconds.

Safe response bodies and checks: `test-results/v02-continuation-2026-10-18/report.json`.
Successful secret-bearing responses are redacted; failure text is retained. The production
escrow worker does not expose its HTTP bodies to this harness, so no complete provider-body
capture is claimed for that operation.

After disclosure of the guard error and token disposal, Rick explicitly authorized one
fresh exchange each for 224 and 226. Certificate 225 is excluded from the resumed run.
That run has its own attempt marker and report directory; the earlier evidence is retained.

## Authorized resume — 2026-10-18: all live assertions pass

Rick authorized one fresh exchange each for 224 and 226 after the harness URL-guard error.
Both returned HTTP 200 and unwrapped successfully; 225 was not retried. The same provider-
issued identifiers above were stored for five credentials per pool. The resumed test passed
in **33.22 seconds**, with **40/40 checks** passing (test body 28.14 seconds).

| Assertion | Expected | Actual | Result |
|---|---|---|---|
| 1. Sealed result and unaffected treatments | One grant per result; sealed risk code; other treatments unchanged | A: six rows; B: five rows. Both sealed; clear/masked/tokenized/withheld checks passed. B's original mask also verified before its custody decision. | Pass |
| 2. Opintel redemption | One release of K2; replay refused | Both pools released K2 once and refused a second redemption. | Pass |
| 3. Own device fetch | HTTP 200 and exact escrowed K1 | Both returned 32-byte shares; SHA-256 digests matched the independently observed escrow inputs. | Pass |
| 4. Unseal | Both shares recover fixture values; either alone fails | All six A and five B risk codes matched the definition; each single share failed authentication for every cell. | Pass |
| 5. Cross-pool refusal | B cannot fetch A's packet; A cannot fetch B's | Both HTTP 403, attempted before rightful retrieval. | Pass |
| 6. Revocation with K1 retained | K2 disposed; redemption refuses; K1 still available at XQ | Stored K2 null, state revoked, remote cleanup pending; MCP refused; real XQ fetch returned HTTP 200 with matching K1. Explicit remote-cleanup outage injection only. | Pass |
| 7. Receipt | Timed Opintel release; no literal values or read claim | Both receipts passed fixture-literal checks, contained the exact non-claim, had one timed Opintel release and no provider-read event. | Pass |

Exactly **three type-8 packets** were created in this resume: A, B, and the grant revoked
before redemption. Each came from one custody query result. Ten original agents also passed
their existing cedant row filters (six A rows, five B rows). No new certificate was created.
The earlier guard-failure attempt created one additional packet; it is not hidden in this
run's three-packet count.

Full refusal body for **both** cross-pool fetches (unchanged, no sensitive values):

```json
{"status":"Could not get the key associated with this token. Are you a valid recipient and signed into the correct team?"}
```

The receipt's exact statement is:

> Opintel released its share of the key. This does not evidence that the agent obtained the provider's share or decrypted the value.

The harness proves decryption independently; it does not add that claim to the receipt.

| UTC time | Operation | HTTP |
|---|---|---|
| 2026-10-18T04:28:08.616Z | `/time` | 200 |
| 2026-10-18T04:28:08.895Z | `/authorize/certificate/226` | 200 |
| 2026-10-18T04:28:09.208Z | `/time` | 200 |
| 2026-10-18T04:28:09.300Z | `/authorize/certificate/224` | 200 |
| 2026-10-18T04:28:28.463Z | `fetch` | 403 |
| 2026-10-18T04:28:29.684Z | `fetch` | 200 |
| 2026-10-18T04:28:31.391Z | `fetch` | 403 |
| 2026-10-18T04:28:31.760Z | `fetch` | 200 |
| 2026-10-18T04:28:33.849Z | `fetch` | 200 |

Local artifacts: `test-results/v02-authorized-resume-2026-10-18/report.json` and its exclusive
attempt marker. Successful token/share-bearing bodies are redacted rather than persisted.
Failure bodies are retained without dropping fields; the note contains them in full.
Earlier attempts and their distinct markers/reports remain intact.

## Completed-candidate gate

`npm run check` ran once on the V-02 candidate based on `d9f1733`, with no Node listeners
at preflight. The gate's port-bind isolation checks also passed. No warm pass or retry.
**All tiers passed; wall time 2,075.32 seconds (34m 35.32s).**

| Tier | Seconds | Result |
|---|---:|---|
| `typecheck` | 40.85 | Pass |
| `typecheck:conformance` | 9.06 | Pass |
| `lint` | 23.78 | Pass |
| `build:production` | 4.07 | Pass |
| `test:conformance` | 299.18 | Pass |
| `test` | 1630.49 | Pass |
| `test:smoke` | 67.79 | Pass |

Domain/integration: 1,845 tests in 202 files. Conformance: 54/54 routes, zero findings,
59 browser checks. Smoke: one complete sign-in → pool → row filter → MCP → receipt path.
The domain tier dominates the wall time at 1,630.49 seconds.

The gate record names its starting HEAD, `d9f1733`; the tested fixture/harness was in the
working tree. The artifact-path-only correction described below happened during the gate;
its final `npm run typecheck` and `npm run lint` both passed separately after the gate. No live assertion or XQ
operation is repeated for that correction. Gate JSON is retained outside Playwright's
output tree at `tmp/review/v02-authorized-resume-2026-10-18/gate.json`.

### Retained `/time` bodies

These are the complete non-secret response bodies, copied from the retained run output.
Certificate-exchange success envelopes and successful key-fetch bodies are deliberately
redacted because they carry token/share material.

| Attempt | UTC request time | HTTP | Full body |
|---|---|---|---|
| Diagnostic 226 | 2026-10-18T04:25:28.756Z | 200 | `1792297531741` |
| Diagnostic 225 | 2026-10-18T04:25:29.942Z | 200 | `1792297532333` |
| Diagnostic 224 | 2026-10-18T04:25:30.057Z | 200 | `1792297532409` |
| Authorized resume 226 | 2026-10-18T04:28:08.616Z | 200 | `1792297691203` |
| Authorized resume 224 | 2026-10-18T04:28:09.208Z | 200 | `1792297691610` |

## Gate-discovered artifact retention correction

Playwright clears the repository's `test-results/` output directory at browser-suite start.
That removed the original local V-02 JSON reports and attempt markers during this gate.
The complete refusal bodies, HTTP sequence and assertion results had already been transcribed
into this note; those records survive. Recovery summaries from the retained tool output are
explicitly labelled as summaries, not recreated original reports:

- `tmp/review/v02-continuation-2026-10-18/recovered-summary.json`
- `tmp/review/v02-authorized-resume-2026-10-18/recovered-summary.json`

The harness now writes reports and the exclusive marker under `tmp/review/`, outside
Playwright's disposable output tree. A marker recording the completed authorized run was
restored there to prevent accidental repetition. This path-only tooling correction occurred
after the gate's initial typecheck/lint tiers; the final typecheck and lint both passed afterward.
No XQ call or live assertion was repeated for this correction. Earlier references to local
`test-results/` reports describe where those attempts originally wrote, not durable files.

## Change ledger

| Version | Date | Change | Impact on the product |
|---|---|---|---|
| 1 | 2026-10-17 | V-02 live harness extends the V-01 fixture; independent agent process and explicit pending-cleanup condition. | Verification only; no product behavior change. |
| 2 | 2026-10-18 | Retain certificate refusal bodies; adopt the approved two-pool certificate arrangement; correct the SDK FetchKey URL guard. | Verification only; no product behavior change. |
