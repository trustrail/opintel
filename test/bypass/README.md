# S2b black-box attack suite

Run `npx vitest run test/bypass/attacks.test.ts`. Set `BYPASS_REPORT` to a file
path to collect observations even when assertions fail. The default test
configuration includes this suite. Nothing is skipped or marked as an expected
failure. Its current red state must stay visible until the responsible items
close the gaps.

The harness imports only the published `sidecar/session/index.ts` interface.
It uses the documented `SessionEngine` injection point to seed real DuckDB
instances before hardening. It does not inspect S2a source or insert a SQL filter.
The same attack text is submitted unchanged through `TwoSessionExecutor` and
its arrival is verified using the driver's statement observer.

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
error code was available. `INVALID_PROBE` means syntax or a missing function
prevented the specified spelling from exercising its claimed property. These
remain failing tests; they are not reported as protection and their attack text
is retained for review. J-048 checks the structured-refusal requirement across
all observed refusals. `BLOCKED` and `EXPECTED_SUCCESS` are separate categories.
