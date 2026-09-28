# S2b black-box attack suite

Run `npm run test:bypass`. The standalone `vitest.bypass.config.ts` project is
excluded from `npm test`, just as the performance project is. CI runs both.
No attack is skipped and no assertion is wrapped in `it.fails` or a catch that
treats arbitrary failure as success. The underlying tests keep their assertions.

The runner prints a work queue with each open test's owning item. It accepts only
the reviewed entries in `open-attacks.json`: exact file/test identity, exact
assertion error and matching attack observations. A new failure, newly
succeeding attack, different leaked result, timeout, hook/unhandled error,
missing required test, skip or pending test fails the gate. The required-test
inventory prevents deletion from silently shrinking the suite.

An unexpectedly passing registered test also fails the gate: remove its open
entry in the same change that closes it. When an owning item lands, remove its
exemptions; unresolved assertions then fail normally. The registry is reviewed
source, never automatically updated from a failing run. J-055's documented
tracker limitation remains a normal passing test, not an exemption.

The only variable evidence normalized is J-020's allocator-specific OOM text,
and only when it starts with the exact `Out of Memory Error:` family. The test
still independently asserts actual OOM, inspected execution and zero spill.
Every other registered observation is compared exactly. Gate regression tests
live in the main functional project at `test/bypass-gate.test.ts`.

For raw diagnostic output, run
`npx vitest run --config vitest.bypass.config.ts`; that command intentionally
reports the underlying failures and exits nonzero. `npm run test:bypass` always
runs the complete inventory and does not accept filtering flags. Set
`BYPASS_REPORT` to retain observations and `BYPASS_PROOF_REPORT` to retain parsed
forms and driver evidence from the synthetic fixtures.

The harness imports the published session and SQL inspection interfaces.
It uses the documented `SessionEngine` injection point to seed real DuckDB
instances before hardening. It inserts no test-only SQL filter. Attack text is
submitted unchanged through `InspectedSessionExecutor`. Positive and broken-lock
controls retain `TwoSessionExecutor`; the approved split and three proof
categories are recorded in `docs/bypass-attacks.md`.

Refused attacks assert native parse evidence, serialization outcomes and absence
of preparation/execution where required. A tree refusal must name a construct
actually present in the recorded tree. Queries whose binding fails must have
passed subset inspection and must not execute. Set `BYPASS_PROOF_REPORT` to
record the trees and driver events for these synthetic fixtures; this is not
application telemetry. The memory-pressure child also uses inspected execution
and proves it reached the prepared handle before running out of memory.

Privileged fixtures contain sentinel plaintext under `__staging` and an internal
catalogue alias. Agent fixtures contain only their permitted columns under
`warehouse.public`; this is a separate in-memory fixture catalogue, not a source
attachment. `records` and `t` are aliases of the fixture's `orders`. The fixture
policy declares amount aggregate-only (k=5), customer_id tokenized, card_number
masked, salary withheld and undecided_col undecided. Those policy facts are test
inputs, not an implementation of inspection or treatments.

Group C positive configurations deliberately place the protected objects in the
agent instance and run the same SQL. A refusal cannot pass because its fixture
was missing or its SQL could not run. File probes use existing controlled files
as well as the literal paths requested by the specification. The lock mutation
control omits only lock_configuration through the injected engine port. Ordinary
attacks never mutate or intercept the hardening sequence.

J-040 proves that grouping cannot undo a mask already present in the agent
fixture; it does not claim to prove S2e's source-to-staging mask transformation.
J-055 asserts expected tracker success with two sets of at least five rows and a
subtraction that isolates one person's salary. The authenticated SQL transport
is absent; J-044/J-045 deliberately fail with named prerequisites rather than
using a fake authentication pipeline. They must be replaced with actual
cross-pool and mid-session expiry/revocation attacks when 5.7 lands.

`ATTACK_SUCCEEDED` means the prohibited statement completed or protected metadata
was exposed. `REFUSED_RAW` means the engine blocked the operation but no structured
error code was available. `INVALID_PROBE` means an unrelated raw failure prevented
the specified spelling from exercising its claimed property. The approved
`parse_failed` and `serialization_refused` categories instead require engine
evidence and zero agent prepare/execute calls. Their envelope code remains
`sql_not_permitted`; proof categories do not add API error codes.
J-048 checks the structured-refusal requirement across
all observed refusals. `BLOCKED` and `EXPECTED_SUCCESS` are separate categories.
