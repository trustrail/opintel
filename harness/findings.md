# Agent-perspective findings

These are human findings, not test assertions. Link each future entry to its
transcript and case. Keep expectation, observation and decision separate.

## H-001 — An answer's evidence reference cannot be retrieved by its agent

Recorded: 2026-10-06. Source: reviewed current MCP contract and the decision
made while designing this harness; not a new live harness observation.

**Expected:** An agent receiving an evidence id might expect to retrieve the
record it identifies, to explain an answer to a person.

**Observed:** An agent receives an evidence id with every successful answer
and cannot retrieve what it refers to through the current MCP interface.
The advertised tools are `opintel.describe`, `opintel.explain` and
`opintel.query`. The evidence reader is an operator console endpoint with
user-session permissions; a pool key does not grant that access.

**Decision:** The harness records the answer's reference and advertised tools.
It does not use console credentials or invent a retrieval tool. This is a
product decision, not an implementation gap to fill here. Open question:
should an agent be able to read the record of its own answer, and what would
it be permitted to see? An agent that can show a person why it answered as
it did is a different product from one that cannot. No answer is chosen here.

## H-002 — LangChain preserves text and status but drops result metadata

Recorded: 2026-10-06. Source: local, explicitly mock MCP verification with
MCP 1.30.0, langchain-mcp-adapters 0.3.2 and langchain-core 1.6.6. This is
framework evidence, not a live Opintel observation. Mock transcripts stay
outside the committed Opintel transcript directory.

**Expected:** The framework makes server content and metadata available to
its caller, including reduction details and refusal code/retryability.

**Observed:** ToolMessage keeps the text and success/error status. It adds
content-block ids, so exact block equality differs even when text survives.
Successful structuredContent survives under artifact.structured_content.
The adapter drops result `_meta`; in Opintel that includes reduction metadata
and refusal details. The mock explain refusal also lost structuredContent
because the adapter's error conversion produced an error ToolMessage without
an artifact. The raw transcript retains those fields beside the framework
result, making the distinction inspectable.

**Decision:** Record both perspectives and explicit preservation comparisons;
do not repair or reinterpret the framework result inside this harness.
Whether Opintel should offer framework-specific adaptation remains undecided.

## Adding a finding

- Date, identifier, transcript link and case:
- Expected:
- Observed:
- Decided (or explicitly undecided):
