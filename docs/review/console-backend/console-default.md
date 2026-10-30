# Packaged default console

Console-next is served at `/`. Real workflows that have not been ported remain
under `/legacy/`, with their screen code frozen. Nothing with a real workflow was
removed. The mounting entry is `src/legacy-entry.tsx`; the compatibility policy is
`src/shared/console-destinations.mjs`, used by the packaged static service and the
console-next development server.

## URL compatibility

| Existing destination | Default destination |
| --- | --- |
| Project dashboard | Home, retaining project scope |
| Activity | Activity, retaining range, outcome, agent and pool |
| Run permalink | Activity receipt, retaining run ID and full-precision startedAt |
| Pools / pool detail | Pools / selected pool |
| Entitlements | Data, retaining pool, element and decision |
| Suggestions | Data Suggestions, retaining pool and element |
| Data sources | Data Sources |
| Engine, query, discovery, evidence, agent and token settings | Corresponding Settings section |
| Auth, personal/company administration, declarations, Observations, scan history, agent detail and advanced row decisions | Corresponding `/legacy/` screen |

Magic-link completion uses the existing full navigation, so its root landing or
ported return URL enters console-next. OIDC's existing `/projects` success landing
redirects to the root. Old email callback/device-confirmation URLs remain valid.
Needs-you and health destinations use the same compatibility policy. Observation
findings retain their legacy investigation context. Data's declaration link and
advanced Settings administration explicitly name the legacy destination.

Removed heading-only destinations: releases, workbench, vocabulary,
source-of-truth, relationships, knowledge and audit-log; also the heading-only
global navigation routes. Development galleries remain in development/browser-test
builds and remain excluded from production. Every real legacy route remains.

## Controls, font and settings

All console-next dropdowns share `components/select.tsx`, using Radix Select;
there are no native select elements in its source. The trigger and options use the
shared focus/touch tokens, with 44 px targets and constrained phone-width menus.

Inter 4.1 variable upright WOFF2 and its SIL OFL 1.1 licence are packaged at
`/fonts/InterVariable.woff2` and `/fonts/OFL.txt`; no external font request is used.
See [font provenance](inter-font-notice.md).

Every one of the 26 `projectSettingDefinitions` appears in exactly one existing
Settings section and is edited through the existing project settings PATCH API:

| Section | Definitions |
| --- | --- |
| Query limits | timeoutSeconds, rowLimit, cardinalityConfirmThreshold, aggregateMinGroupSize, memoryLimitMb, concurrencyPerPool, maxStagingRows, maxQueuedExecutions |
| Discovery | newElements, typeFamilyChange, renameHandling, adoptRenamedNames, valueSampling, sampleSize |
| Evidence kept | fullRetentionDays, rollupRetentionDays, redaction, allowlistedFields, captureSamplingPercent |
| Custody | provider, tenant, region, grant_ttl |
| People | poolKeyGraceSeconds, agentHeartbeatSeconds, agentDisconnectGraceSeconds |

Grant lifetime displays minutes and saves seconds. The tenant displays as `[team]`
and uses a masked editor. Provider changes retain explicit revocation confirmation
and the existing live-grant-count concurrency guard. Existing grouped settings are
preserved in PATCH bodies; flat defaults use the API's supported explicit values.
No new application API or setting was added.

## Verification

The fresh gateway and engine archives were built from runtime revision
`a90b3dd475db8efcce0b05ef143d165d46848e3f`. All seven Linux/amd64 images passed
layer-secret, runtime allowlist and runtime-user readability audits. Archive
SHA-256 hashes, actual redirects and font evidence are in
[the acceptance record](console-default-acceptance.json).

| Fresh packaged-install step | Result |
| --- | --- |
| Install gateway and engine; one-code pair | Passed; isolated package state, no dev server |
| Sign in as owner | Passed through the console and locally caught SMTP message |
| Create project | Passed; its one paired engine joined atomically |
| Verify the engine | Passed through Home |
| Connect and scan source | Passed, using the reference added with packaged `./sources add`; 2 tables, 8 columns, approximately 11 rows |
| Create pool | Passed; one bound table, `id >= 5`, one thread |
| Explicit treatment and credential | Clear decision saved for `id`; named credential issued through Pools |
| First real MCP request | Answered with the 6 permitted rows |
| Activity receipt and permanent marker | Receipt visible; project read contains firstReceiptAt; Home tracker disappears |
| Root Home, Activity, Pools, Data, Settings | Passed in light and dark |
| Phone Home and Pools | No horizontal document overflow at 390 px |
| Phone Select | Actual trigger and option targets are at least 44 px; no horizontal overflow |
| Extended Settings | All 8 query settings visible |
| Observations from console-next | Opened `/legacy/projects/{project}/observations` through the account menu |

The five tested old URL outcomes were:

| Old URL | Landing and asserted state |
| --- | --- |
| `/projects/P/dashboard` | `/?project=P`, Home numbers visible |
| `/projects/P/activity?from=F&to=T&outcome=answered&poolId=Q` | `/?project=P&screen=activity&from=F&to=T&outcome=answered&pool=Q`; the single matching request is visible |
| `/projects/P/runs/R?startedAt=A` | `/?project=P&screen=activity&run=R&startedAt=A`; the answered 6-row receipt opens, retaining microsecond precision |
| `/projects/P/entitlements?poolId=Q&elementId=E&decision=decided` | Data Entitlements, same pool/element/decision; exactly the selected column is shown |
| `/projects/P/relationship-suggestions?poolId=Q&elementId=E` | Data Suggestions, same pool/element; genuine empty state |

No API responses were mocked in this acceptance. Customer data was synthetic in a
separate ordinary Postgres fixture. The driver stopped its own gateway, engine,
source and mail containers; the development Postgres and Redis stayed running.
The final browser run reported zero page errors. Chromium's rendered-font API
confirmed a custom Inter font in all 13 requested captures, and all observed font
response origins were the installation's own origin.

Targeted checks passed: 88 console tests; 42 tests in the route, font, static
server, bundle, DEP-008, artifact, navigation and conformance contracts; 19 tests
in the final packaging/authentication subset; both strict typechecks; lint; the
production build; 38 conformance checks with 33/33 real legacy screens and zero
findings; and the continuous real browser/MCP smoke path (10.0 seconds within its
unchanged deadline). The single completed-candidate full gate is run after these
captures and this report are committed; its outcome is reported with the push.

## Captures and visual limits

The captures show the fresh installation's real, sparse data. Custody is not
configured on the new project, TLS is self-signed, and retention has not been set;
the corresponding warnings and omitted band panels reflect that state. Real
legacy screens retain their existing design. The light Activity capture shows a
clipped Right now mini-ring/caption; the dark capture renders it fully. No Activity
layout redesign was made in this switch-over.

| Screen | 1440 light | 1440 dark | 390 light |
| --- | --- | --- | --- |
| Home | [PNG](console-default-screenshots/1440-light-home.png) | [PNG](console-default-screenshots/1440-dark-home.png) | [PNG](console-default-screenshots/390-light-home.png) |
| Pools | [PNG](console-default-screenshots/1440-light-pools.png) | [PNG](console-default-screenshots/1440-dark-pools.png) | [PNG](console-default-screenshots/390-light-pools.png) |
| Data | [PNG](console-default-screenshots/1440-light-data.png) | [PNG](console-default-screenshots/1440-dark-data.png) | — |
| Activity | [PNG](console-default-screenshots/1440-light-activity.png) | [PNG](console-default-screenshots/1440-dark-activity.png) | — |
| Settings | [PNG](console-default-screenshots/1440-light-settings.png) | [PNG](console-default-screenshots/1440-dark-settings.png) | — |

[Extended Settings, 1440 light](console-default-screenshots/1440-light-settings-extended.png).

