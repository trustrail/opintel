# Applied migration 049 — forward correction

049 was edited after deployment. The change replaced `tenant_write FOR ALL`
with `FOR INSERT` on both export tables and added `tenant_update FOR UPDATE`
on the mutable idempotency receipt table. The intended policy correction was
valid; delivering it by changing 049 was not.

The 5.13 verification reverted/reapplied the edited file in the isolated test
database. That tested the new schema against a rewritten history, not an upgrade
from the applied history. The review's statements about applying only to the
test database did not establish that other databases had not applied 049.
The development database had applied the earlier version on
2026-09-29 at 04:49:59 UTC. The isolated database subsequently recorded the edited
version at 14:17:12 UTC. Git's first commit of 049 already contained the edit, so
Git history alone did not preserve its deployed form.

The development ledger and its live `FOR ALL` policies established the original
form. Restoring the original policy statements and removing the later UPDATE
policy reproduces the **exact** recorded SHA-256:

- Applied/restored: `c955644191579330232bd09cb381e765a1071a592a0153ead2958316d01e5372`
- Edited: `31dab579efd041179927575b846d80859630981f1fec77cabddfcb9f8ea5ba00`

The checksum guard behaved correctly: it verifies applied files before executing
pending migrations, so the mismatch blocked 050, 051 and 052, including 052's
forward partition provisioning. No checksum exception or ledger rewrite is part
of this repair.

049 is now restored byte-for-byte. **053** performs the policy correction in a
new transaction, preserving both project and actor predicates and all grants.
Its down migration restores the original policies without deleting descriptors
or receipts. The pending expiry index addition to published 052 has also moved
to **054**; 052 now matches its published bytes. This avoids repeating the same
history-edit pattern for that addition.

AGENTS.md now states the immutable-applied-migration rule explicitly. The new
regression pins 049's known applied checksum and starts a disposable database
at original 049 using the real runner and ledger. It then upgrades normally,
without rewriting history, and checks existing export data, grants, discovery
backfill and future evidence partitions. Fresh installations are verified too.
Databases built from the edited 049 (including the old isolated test database)
have a different history and must be recreated if disposable, not made to appear
compatible by replacing their checksum. Development data and its ledger were
read only during this repair.

## Verification

- Fresh installation: real migration runner applied 001–054 successfully in a
  temporary database.
- Final targeted regression: **six files, 26 tests passed** (17.25 seconds).
  This includes original-049 checksum/upgrade proof; 053 down/up twice; 054
  down/up; exact project/actor policy predicates; export data and grant
  preservation; settings backfill and month +3 provisioning; existing HTTP
  export, RLS, grant and migration-runner regressions.
- Strict typecheck, lint and diff checks passed. The full application and bypass
  suites were not repeated for this migration-only repair.
- Temporary verification databases were removed afterward. Neither the
  development database nor the old isolated test ledger was modified.
