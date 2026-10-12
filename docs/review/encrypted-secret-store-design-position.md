# Encrypted secret storage: deferred design position

This is separate security architecture, not part of 5.36. Custody provider credentials remain operator-provisioned environment secrets per deployment, resolved through the existing secret-store port. Settings reports presence only and cannot write them.

A writable database-backed secret store is needed when per-project provider credentials or multi-tenant deployments arrive. It must use envelope encryption under a key held outside the database, provisioned through the environment or KMS. The database must never contain the external wrapping key or plaintext secrets.

Before implementation, review key provisioning, access scope and tenant isolation, authenticated encryption and context binding, wrapping-key and data-key rotation, backup/restore, recovery and loss of the external key, audit and telemetry redaction, and transient-memory/ephemerality coverage. No choice of algorithms, KMS or recovery contract is made here. The implementation must remain behind the existing secret-handling port.
