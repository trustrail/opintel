# Compound row-rule editor correction

Branch: `fix/row-rule-conditions`, based on main `770174d`. `fix/connect-reliability` at `20618f7` remains paused. No migration, evidence rewrite, new endpoint or stylesheet change.

## Environment

Before validation, `docker compose ps postgres redis` showed `opintel-postgres-1` and `opintel-redis-1` running and healthy, both up 34 hours. No development service was restarted.

## Evidence and limits

The reported MacBook Air incident has no captured browser event sequence or request body in this checkout. Basic mixed DECIMAL/DATE entry passed on the unchanged implementation: four console tests, two real API tests and two real Chromium tests retained both AND/OR conditions. Those results do not disprove the incident and are not described as a failing reproduction.

The user subsequently confirmed that `"claim_amount" > 1000` was the current rule and the editor opened empty. The supplied browser choice and fresh-reproduction fields remained placeholders; they are not treated as measurements. Tests additionally cover opening that single stored rule, adding the date condition and submitting both conditions with AND or OR.

A narrower state regression failed before the fix: condition callbacks retained from one render replaced whole draft snapshots. Updating the first condition from 1000 to 2000, then updating the date through the other callback, restored 1000. That demonstrates a rule becoming looser. The test deliberately retains callbacks from one render; it does not establish that the MacBook Air followed that event ordering.

A second failing regression showed native TIMESTAMP input at minute precision leaving Apply disabled. HTML date-time inputs can produce `2026-11-01T00:00`; the predicate grammar requires seconds. This establishes a blocked-save defect, but does not establish that the reported DATE condition used TIMESTAMP metadata.

Two prefill tests failed: SetRows never read the current decision. Two fault-injection API tests also failed: a final parsed predicate missing a requested term was accepted. Ordinary valid API compound requests already preserved every condition; the injection tests cover the requested defence in depth.

Retained development logs:

- `/private/tmp/row-rule-conditions-console-red.log`: initial four mixed-type console regressions passed.
- `/private/tmp/row-rule-conditions-browser-red.log`: initial two Chromium cases passed.
- `/private/tmp/row-rule-conditions-api-baseline.log`: corrected fixture, two API cases passed. The initial fixture hit the catalogue rename guard; corrected by creating a new fixture table, without changing that guard.
- `/private/tmp/row-rule-conditions-callback-red.log`: state regression, expected 2000, received 1000.
- `/private/tmp/row-rule-conditions-temporal-red.log`: both timestamp cases expected enabled Apply, received disabled.
- `/private/tmp/row-rule-conditions-prefill-red.log`: both current-rule prefill cases failed.
- `/private/tmp/row-rule-conditions-completeness-red.log`: both injected-loss cases expected HTTP 400, received 200.

## Causes and changes

References to the old implementation below are at base `770174d`.

- `src/console-next/pools/rows.tsx:35,39-40`: condition controls spread a captured condition/draft, and change/add/remove/combine spread the captured whole rule. The first condition also carried the rule's extra conditions. Condition changes now carry field patches; every builder action composes a functional update against the latest state. The first condition passed to controls contains only its own fields. Shared and per-table creation use the same updater contract.
- `src/console-next/pools/commands.tsx:19-20`: mutation read its rule from a render closure and always initialized a blank draft. Submit now supplies the complete validated rule as mutation data. Pool creation likewise snapshots the shared rule and every per-table rule at submission. The editor first reads the existing decision through the existing API, prefills every supported condition and its combinator, and displays `Saving replaces the current rule: <expression>`. Unsupported stored grammar is never silently flattened or submitted; it requires an explicit replacement.
- `src/console-next/pools/rows.tsx:20,29,33-35` and `src/shared/row-predicate-syntax.ts:19-21`: browser minute precision was not converted to the grammar's seconds precision. Complete minute-precision TIME/TIMESTAMP values now get explicit `:00`; invalid/incomplete dates remain invalid. Condition-local messages name the incomplete column and reason. Validation uses each condition's own column and type. Required inputs belong only to active controls; explicit null remains null.
- `src/modules/pools/application/row-rule.ts`: the final typed predicate now must equal the normalized composition of every individually validated condition, including combinator and duplicate terms. A mismatch refuses the request before any decision write. Both requested expression text and immutable receipt decision links retain all terms.

## Validation

Targeted validation completed so far:

- All console tests: 153 passed in 13 files. After adding the TIME precision/invalid-date test, final Pools-only validation: 40 passed (`/private/tmp/row-rule-conditions-console-final.log`).
- Backend row API/enforcement/predicate/composition/receipt suites: 53 passed in six files. The exact existing-numeric-rule API fixture was then rechecked: all 16 table API tests passed.
- Initial fixed Chromium mixed-type cases: two passed, zero control-conformance findings. The final existing-rule Chromium cases also passed: two cases, zero findings; `/private/tmp/row-rule-conditions-browser-existing-rule.log`.
- Strict application typecheck, conformance typecheck and lint passed. Typecheck caught unsupported Testing Library options and a missing optional-column narrowing in the implementation round; both were corrected before the gate.
- `git diff --check` passed.

Completed-candidate full gate and fresh packaged first-receipt install are pending. No full gate has run for this branch.
