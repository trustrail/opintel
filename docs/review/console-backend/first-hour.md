# First-hour acceptance

The pre-implementation baseline at `ccb09ae` ran against the retained local
install using a normal authenticated session. It created a new empty project,
created a pool, registered and verified its engine, designated custody, saved
explicit project settings and submitted the existing demo database through the
ordinary customer-source endpoint. It failed at **bind-source**, HTTP 404, as
expected. [Retained result](first-hour-baseline.json).

`scripts/images/first-hour.mjs` uses only public HTTP/MCP calls; it imports no
application services, database scopes or seeder. `stage5-smoke.mjs` invokes it
immediately after normal SMTP login and records its step results in the release
acceptance's `result.json`. Missing endpoints fail the named step; there is no
skip or alternate provisioning path. The standalone baseline uses the existing
development demo database; release acceptance uses the paired engine's shipped
demo database reference. Later missing fixture prerequisites remain failures,
not a pass inferred from reaching the binding step.

Each subsequent step requires successful source introspection, six supported
fields, explicit contributor/token declarations, one decision per treatment,
credential issuance, a successful MCP query and its completed Activity receipt.
No credential or session value is included in the result.
