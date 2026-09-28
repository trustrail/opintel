# Separate bypass regression gate

`npm test` excludes `test/bypass/`. `npm run test:bypass` runs its named Vitest
project in a separate process, without database/service prerequisites: these
tests use isolated DuckDB instances and synthetic files. CI invokes both gates;
the bypass step has no `continue-on-error` allowance.

Current result after the S2e resource-envelope fix: **95 passing checks, two registered open checks, zero
regressions**. The owned work queue is:

| Checks | Owner | Open behavior |
|---|---|---|
| J-044, J-045 | 5.7 | Authenticated query transport prerequisites |

[S2d](s2d-results.md) closed J-035–J-039 and removed their six exemptions.
[The S2e resource-envelope fix](s2e-progress.md) closed J-048; staged execution and governance are recorded there. J-055 remains a passing test of the documented tracker limitation.

## Distinguishing expected failures from regressions

The reviewed `test/bypass/open-attacks.json` pins each open check's file/name,
assertion error name/message, observed attack variant/status/result and owner.
All must match. A timeout, setup failure or different returned data cannot
inherit an exemption merely by failing a known test. J-020's variable allocator
sizes alone are normalized to the exact native OOM family; its original test
still proves OOM and zero spill.

The runner also checks every unsafe observation against that registry. Thus a
new `ATTACK_SUCCEEDED` fails even if its test accidentally stops asserting
refusal. A new raw-error observation cannot hide behind J-048's known failure.
Hook, collection, shutdown and unhandled errors fail independently.

The required-test inventory prevents deletion from silently reducing coverage.
Missing, duplicate, skipped and pending tests fail. New tests may be added;
their failures are never automatically exempted. There is no baseline update
mode, wildcard expectation, retry allowance or `it.fails` wrapper.

When an owner lands its fix, it must remove the corresponding open entries in
the same change. Unexpected passes fail until stale entries are removed. Owner
completion is a reviewed implementation change, not inferred from code text.
Remaining failures become ordinary failures when their exemption is removed.

The gate itself has regression tests in the main project, covering new attack
success, timeout substitution, changed evidence, stale entries, missing/skipped
tests, duplicates, interrupted runs, hook errors and the OOM normalization.

## Approved J-052 change

J-052 is not an open compatibility gap. The user explicitly approved changing
its expectation from filtered output to refusal, preserving both SQL strings.
Dynamic PIVOT fails serialization and returns `sql_not_permitted` with
`proofCategory: serialization_refused`. The current UNPIVOT probe serializes;
its PIVOT table-reference node is explicitly refused with tree evidence and
`proofCategory: sql_not_permitted`. No serialization failure is fabricated.

The exact PIVOT proof-category assertion fails if future DuckDB support removes
the serialization refusal. Admitting that form would require revisiting the
test and proving that generated columns are entitled. Both current J-052
variants pass and neither has a registry exemption.
