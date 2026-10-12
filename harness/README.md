# What an agent experiences

This harness exercises Opintel deliberately and leaves dated transcripts for a
person to judge. It is separate from `npm test`, CI and every conformance gate.
A refusal's existence is not a verdict on whether an agent could act on it.

The raw runners use the official Python MCP SDK **1.30.0**, `ClientSession`
with Streamable HTTP. The recording HTTP transport captures response bodies
before SDK validation or content conversion. The 1.x version is deliberate:
LangChain MCP adapters 0.3.2 requires MCP <2. Both paths share the transport.
`requirements.lock.txt` pins the complete verified dependency environment;
`requirements.txt` lists the three direct dependencies.

## Setup and configuration

Python 3.11 or later:

```sh
python3 -m venv harness/.venv
harness/.venv/bin/pip install -r harness/requirements.lock.txt
```

Supply these in your shell environment or an ignored local environment file:

- `OPINTEL_MCP_ENDPOINT`: full endpoint, e.g. `http://localhost:3000/mcp/v1/p/PROJECT_UUID`.
- `OPINTEL_POOL_KEY`: the pool's bearer key. Do not put it in a command-line argument or tracked file.
- `OPINTEL_AGENT_ID`: the self-declared agent identifier used for this run.

The client sends `Authorization: Bearer …` and `X-Opintel-Agent-Id`; neither
header is transcribed. The endpoint must contain no URL credentials, query or
fragment. Redirects and environment-provided proxies are disabled; TLS
verification remains enabled. HTTP can be used for local development.

Each SQL case comes from an environment variable. Configure explicit exposed
names for a pool you control, using small SELECTs and synthetic data. For
example, `SELECT clear_column FROM catalog.schema.object LIMIT 5`. The harness
neither provisions data nor changes entitlements or declarations. A successful
aggregate must satisfy the configured disclosure minimum.

| Variable | Purpose |
|---|---|
| `OPINTEL_HARNESS_CLEAR_SQL` | A named clear projection; reused by evidence |
| `OPINTEL_HARNESS_WITHHELD_SQL` | A directly named withheld column |
| `OPINTEL_HARNESS_AGGREGATE_ROW_SQL` | Read an aggregate-only column row by row |
| `OPINTEL_HARNESS_AGGREGATE_SQL` | Read that column in a permitted aggregate |
| `OPINTEL_HARNESS_TOKEN_SQL` | Return a tokenized column |
| `OPINTEL_HARNESS_TOKEN_ORDER_SQL` | Order that tokenized column |
| `OPINTEL_HARNESS_JOIN_SQL` | Equality join between two tokenized columns with different effective domains, used by explain and query |

Do not assume the development demo supplies the different-domain join: it
assigns shared domains. Pick two isolated elements or explicitly different
domains. Describe exposes treatments, not domain declarations, so discovery
alone cannot safely choose that pair. Missing case configuration fails before
connecting; it is not recorded as an Opintel refusal.

## Run and review

Run any behaviour independently:

```sh
harness/.venv/bin/python harness/describe.py
harness/.venv/bin/python harness/treatments.py
harness/.venv/bin/python harness/refusals.py
harness/.venv/bin/python harness/joins.py
harness/.venv/bin/python harness/evidence.py
harness/.venv/bin/python harness/framework.py
```

Every run opens a new UTC-dated file in `harness/transcripts/`. It records
initialisation, the advertised tools, case requests, HTTP status and raw
response bodies, including `content`, `structuredContent`, `isError` and
`_meta` exactly as received. There is a blank reader-verdict field per case.
JSON is not reformatted in raw body blocks. UTF-8 bodies retain their text;
other bodies use lossless base64. SSE bodies remain verbatim, with incomplete
streams labelled incomplete. HTTP exchanges are numbered and carry the case
that initiated them; long-lived stream completion can appear later in the file.
No headers, cookies, bearer keys or environment dumps are recorded.

An accidental key echo stops capture before the unsafe content is written;
it is not silently redacted and called raw output. Client exception text is
withheld because it may include credentials; its type is recorded separately
from server responses. Interrupted runs retain partial transcripts. Cases
continue after a tool/client exception so subsequent output can be reviewed;
exit status is not a behavioural verdict. A connection failure exits nonzero.

Read the file, fill in the verdicts, add surprises to `findings.md`, and commit
the transcript. The harness creates tracked files but does not automatically
commit them. Compare corresponding case sections between dated runs; changing
request ids, evidence ids, timing and returned data are deliberately retained.
The raw response is authoritative; expectations and observations are labelled
harness-authored. Transcripts can contain returned data and SQL literals: use
synthetic fixtures for transcripts intended for this repository.

## Evidence and framework perspectives

`evidence.py` returns an answer and records its evidence reference alongside
the advertised tools. MCP currently has no evidence retrieval tool. It does
not invent a call or use operator console credentials. H-001 records the open
product decision about agents reading records of their own answers.

`framework.py` runs the same cases through LangChain's actual MCP tools and
`ToolMessage` conversion. It uses no model, provider key or agent planner:
case selection is deterministic so the comparison isolates framework
conversion. It records each raw server response beside the LangChain result,
and reports exact content, text-block, structured-content, metadata and error-status
comparisons. A difference is an observation for the reader, not an assertion
that the framework's choice is necessarily wrong. Artifacts and metadata are
not automatically visible to an LLM; this checks framework preservation,
not a particular model's attention to those fields. External LangSmith tracing
is disabled for this runner. See H-002 for the verified adapter limitation.

## Initial verification

All five raw runners and all ten framework cases were exercised against a
loopback-only, explicitly labelled mock MCP server. Checks covered raw
refusal metadata, evidence-reference observations, blank verdict fields,
framework conversion, and rejection of a credential echo. Python syntax and
`pip check` passed. Those mock transcripts were written outside this
repository, not into the committed agent transcripts. No live Opintel run
was performed: endpoint, pool key and agent id were not supplied in the
implementation shell.

Library references: [official MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x)
and [LangChain MCP adapters](https://reference.langchain.com/python/langchain-mcp-adapters/).


Custody (5.36): run `python harness/custody.py` with the same agent-only
configuration and `OPINTEL_HARNESS_CUSTODY_SQL`. It records raw MCP and local
provider responses, verifies the grant against `describe.custody.keys`, and
unseals locally using Node's AES-256-GCM. No console credentials are used.
`OPINTEL_HARNESS_SECOND_POOL_KEY` enables the other-alias refusal.
`OPINTEL_HARNESS_REVOKED_GRANT` supplies a grant revoked outside the harness.
Use synthetic data: this deliberate recipient transcript contains the shares
and the received values. Neither belongs in production telemetry.
For XQ, supply `OPINTEL_XQ_API_KEY` and the named recipient's
`OPINTEL_XQ_ACCESS_TOKEN`; FetchKey is behind the same adapter and receives
credentials through stdin, never command arguments. This route remains
unverified against live XQ until credentials arrive. The local lifecycle,
expiry and unavailable-Opintel cases also run automatically in the custody
unit/MCP/proof tests; a transcript is not a substitute for those checks.

The K2-first case uses a fresh grant and a second credential. Set
`OPINTEL_HARNESS_WAIT_FOR_EXPIRY=1` for a deliberate expiry transcript; it
waits until the actual signed expiry rather than altering the grant. Set
`OPINTEL_HARNESS_STOP_APPLICATION=1` only for a disposable local instance:
the runner pauses after receiving K1 so a person can stop Opintel externally,
then records the failed K2 transport. Missing prerequisites are recorded as
cases not run, never as successful refusals.
