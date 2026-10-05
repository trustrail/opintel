# Opintel

## Development demo

With Docker running, install dependencies and copy `.env.example` to `.env`, then:

```sh
npm run dev:demo
npm run dev:api
```

`dev:demo` starts the local data services and Opintel Engine, applies migrations, and
creates `demo@opintel.local`, its company, a project on the reinsurance pack,
the prepared and connected spreadsheet demo source, and a bound pool with
clear, tokenized, masked, aggregate-only and withheld decisions. Synthetic
spreadsheets land in the local Compose Postgres. The seeded user is a project
administrator; it is not an authentication bypass.

Treaty references are tokenized, currencies alternate between masked and
withheld, inception dates are aggregate-only, and supported landing provenance
is clear. The pack's unbounded numeric premiums are unsupported by the existing
catalog type mapping and remain withheld. Use `COUNT(inception_date)` or
`MIN(inception_date)` to exercise aggregation. The bootstrap runs `ANALYZE`
inside the demo landing scope so queries can estimate the new tables immediately.

The command prints the MCP endpoint, a usable sample query, and the **pool key
once, when created**. Keep that key: reruns neither reprint nor rotate it, and
no plaintext copy is saved by the script. Use `Authorization: Bearer <pool key>`
and `X-Opintel-Agent-Id: dev-demo` for MCP. If the key is lost, rotate it through
the normal pool key flow.

Reruns resume provisioning and reuse the same user, company, project, source
reservation and pool. Existing entitlement decisions are preserved. After a
volume wipe, rerunning recreates the fixture and retires landing-zone references
to destroyed projects and this demo's obsolete source reservation. The previous
configuration is backed up; landing files and registers remain. Zones for other
existing projects are preserved and checked normally.

The command refuses non-development `NODE_ENV`, non-loopback service URLs,
and custom Opintel Engine configuration. It uses `tmp/sidecar` and serializes its own
runs with `tmp/dev-demo.lock`. After an interrupted process, check that no
`dev:demo` is still running before removing that lock and retrying. The API
can already be running; otherwise start it with the command above.

Fresh `dev:demo` provisioning registers the source as **Reinsurance**, giving it the catalog alias `reinsurance`. Its physical landing schema remains the generated `demo_<sourceId>` schema. There is no administrator control for assigning an exposed schema name, so that component remains generated rather than being changed to `public` for presentation.

An existing provisioned demo keeps its current alias: aliases are immutable by design, and rerunning the bootstrap does not rename them. Fresh provisioning is required to see the readable alias.
