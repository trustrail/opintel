# Internal installation verifier 1.0.0

This artifact is for Opintel operators, never a customer archive or image input.
It uses a normal administrator email-login cookie, engine `./sources add`, the
public console API and ordinary agent MCP connections. It writes only its named
external synthetic database; it never opens the installed metadata database.

Build separately: `node scripts/verification/verifier/package.mjs OUTPUT_DIRECTORY`.
Distribute `OUTPUT_DIRECTORY.tar.gz` internally. Node 20.19+ and Docker CLI are
required on the operator host. The installed gateway and engine archives must
have the same revision. The JSON report records their image digests and revision;
`artifact.json` records the verifier version, revision and source/artifact hashes.

Create a mode-600 JSON input, using absolute paths:

```json
{
  "base": "https://127.0.0.1",
  "gatewayDirectory": "/installation/gateway",
  "engineDirectory": "/installation/engine",
  "cookieFile": "/private/owner.cookie",
  "targetFile": "/private/named-external-database-uri",
  "certificates": "/private/certificates.json",
  "xqApiKeyFile": "/private/xq-api-key",
  "custody": {"tenant": "operator-supplied-team", "region": "us-east-1"}
}
```

The database must be explicitly named, reachable by this host and the engine,
and separate from metadata and readiness. It is populated with the unchanged
versioned V-01 fixture. Credentials stay in the engine reference store; the public
source registration receives only `secret://sources/v01`. An existing reference
is never overwritten or adopted: resumption requires this run’s private
`source-registration.json` to match the explicit target. Choose another
`sourceName` if the name already belongs to another run or customer source. `sourceName` chooses another normal reference name. `sourceHost` optionally names
the same database from the engine network when its address differs from the
operator host (for example, host loopback versus Docker host DNS).
`engineAddress` optionally supplies a certificate-valid paired-engine address
reachable from the gateway; otherwise the installed engine trust address is used.
`connectAddress` optionally routes the host's HTTPS adapter while retaining the
installation hostname, TLS verification and SNI. Agent custody connections must
also be able to reach `base`. Authorised XQ bundle directories (mode 700, private
files mode 600) must be outside the extracted artifact. Normal session expiry
still applies; sign in again and replace the cookie if necessary.

```sh
NODE_EXTRA_CA_CERTS=/installation/gateway/state/ca.pem \
  /internal/verifier/verify --config /private/verify.json --output /private/run --all
/internal/verifier/verify --list
/internal/verifier/verify --config /private/verify.json --output /private/custody --capability custody
/internal/verifier/verify --config /private/verify.json --output /private/one --cell CELL_ID
/internal/verifier/verify --config /private/verify.json --output /private/pool --where pool=0
```

Selection unions `--cell`/`--capability`, then intersects `--where KEY=VALUE`.
`--all` selects the registry, subject to `--where`. Dependencies provision the
fixture, not extra claimed coverage. Each selected cell is scheduled once in
registry order. Optional `--random-seconds N` starts only after finite coverage
passes and is reported separately. It never fills gaps in selected coverage.

Each output directory owns its recorded fixture project and private credential
manifest. Reusing that directory resumes its own setup; use another directory to
create another isolated project. No customer project is adopted. Keep the
private inputs and manifests out of evidence exports and public reports.

`result.json` and `matrix.md` list every selected cell, including those not reached.
Only all selected cells passed is a pass. Missing prerequisites, interruption and
expired retiring credentials are not exercised and fail the run. Expected query
outcomes come from the versioned fixture, not installed responses. Raw rows,
source credentials, device tokens and receipt bodies are not written to reports.
`events.jsonl` contains identifiers/outcomes only for acceptance outage checks.
There is no install-time custody mode: custody cells require all four certificate
exchanges and real unsealing to the independent fixture values, without skipping.

V-01's four `open_reference` cells retain their query answers but now require an
explicit all-rows decision. Pools bind every table through the public table API.
