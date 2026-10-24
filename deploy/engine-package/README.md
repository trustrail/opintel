# Engine package

This is a separate Compose project with no gateway mounts or shared Docker
network. Generated files contain immutable image digests. Docker with Compose
and Linux containers are required. Run ARM64 natively on an ARM64 host.

Provide an absolute operator environment file containing the `ENGINE_*` paths
referenced by `services/*.json`. `ENGINE_CONFIG_DIRECTORY/service.json` holds
engine TLS, audit and source-readiness configuration. Its pinned application
certificate is a gateway trust input, not an availability dependency. The engine
runtime environment resolves the configured readiness source and assigned source
credential references. Supply customer-local audit, custody and optional ingest
directories writable by UID 65534. Keep keys out of images; configure their
customer-local custody according to the deployment's approved custody design.
`ENGINE_XQ_DIRECTORY` is mounted read-only. State is operational metadata only.

```sh
./engine.sh --env-file /etc/opintel/engine.env prepare /var/lib/opintel-engine/state/readiness-egress.json
./engine.sh --env-file /etc/opintel/engine.env start egress
./engine.sh --env-file /etc/opintel/engine.env start engine
./engine.sh --env-file /etc/opintel/engine.env pin
```

The prepare output must be `ENGINE_STATE_DIRECTORY/readiness-egress.json`.
It derives the permanent readiness-source rule from the configured credential;
there is no operator destination list. The companion owns the network namespace
and firewall. Only the engine joins it; control uses an abstract Unix socket,
with no socket file or socket permission operation. Expose `ENGINE_BIND_ADDRESS`
and `ENGINE_PORT` explicitly for gateway reachability (defaults localhost:3100).
The engine supervisor owns worker replacement; Docker restart is not enabled.

Installation and local readiness work with the gateway stopped. Register the
address and displayed certificate pin in the gateway later. Wrong pins and
unknown mappings refuse. Every heartbeat fetches assigned destinations, installs
them alongside permanent readiness and the configured ingest receipt endpoint,
and reports the applied version. Source assignment triggers normal introspection
after acknowledgment. Unconnected sources cannot serve queries.

For optional ingest, configure `receiptUrl` and `landingZones` in service.json.
Keep watched files separate from durable state and rule snapshots. Start with
an empty zone for a genuinely new installation; never discard existing filing
history or remove a state lock without confirming its previous worker stopped.
Offline receipt work persists and is delivered after gateway registration.
Query results are not persisted; ingest lands only into the customer's Postgres.
No demo data, operator credentials or source files are shipped by the package.
