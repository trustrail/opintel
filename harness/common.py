"""Shared transport and transcript writer; no framework on the raw path."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

ROOT = Path(__file__).resolve().parent


class HarnessConfigurationError(ValueError):
    """Only harness-authored messages may be printed outside the transcript."""


@dataclass(frozen=True)
class Case:
    name: str
    expected: str
    tool: str
    sql_env: str | None = None

    def arguments(self) -> dict[str, object]:
        if self.sql_env is None:
            return {}
        sql = os.environ.get(self.sql_env, "").strip()
        if not sql:
            raise HarnessConfigurationError(f"Set {self.sql_env} to the SQL for {self.name}.")
        return {"sql": sql}


@dataclass(frozen=True)
class Configuration:
    endpoint: str
    key: str
    agent_id: str

    @classmethod
    def read(cls) -> Configuration:
        values = [os.environ.get(name, "").strip() for name in
                  ("OPINTEL_MCP_ENDPOINT", "OPINTEL_POOL_KEY", "OPINTEL_AGENT_ID")]
        if not all(values):
            raise HarnessConfigurationError("Set OPINTEL_MCP_ENDPOINT, OPINTEL_POOL_KEY and OPINTEL_AGENT_ID.")
        endpoint, key, agent_id = values
        url = urlsplit(endpoint)
        if (url.scheme not in ("http", "https") or not url.hostname
                or url.username or url.password or url.query or url.fragment):
            raise HarnessConfigurationError("The endpoint must be an HTTP(S) URL without credentials, query or fragment.")
        if any("\n" in value or "\r" in value for value in (key, agent_id)):
            raise HarnessConfigurationError("Credentials and agent id must be single-line values.")
        return cls(endpoint, key, agent_id)


class Transcript:
    def __init__(self, behaviour: str, config: Configuration):
        self.key = config.key
        self.case = "connection"
        self.sequence = 0
        self.responses: list[dict[str, object]] = []
        directory = ROOT / "transcripts"
        directory.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S.%fZ")
        self.path = directory / f"{stamp}-{behaviour}.md"
        self.file = self.path.open("x", encoding="utf-8")
        self.write(f"# {behaviour}: agent-perspective transcript\n\n"
                   f"UTC run: {stamp}\n\nEndpoint: {config.endpoint}\n\n"
                   f"Agent id: {config.agent_id}\n\n"
                   f"Client: mcp {version('mcp')}; httpx {version('httpx')}\n\n"
                   "Credentials and HTTP headers are excluded. Raw response bodies below "
                   "are captured before SDK parsing. Expectations are prompts for human "
                   "review, not automated verdicts.\n\n")

    def write(self, text: str) -> None:
        # An accidental credential echo stops capture; it is never silently redacted
        # and presented as an unchanged server response.
        if self.key in text:
            raise HarnessConfigurationError("Credential found in capture; unsafe content was not written.")
        self.file.write(text)
        self.file.flush()

    def block(self, text: str, language: str = "") -> None:
        fence = "`" * max(3, max((len(m.group()) + 1 for m in re.finditer(r"`+", text)), default=3))
        self.write(f"{fence}{language}\n{text}\n{fence}\n\n")

    def json(self, value: object) -> None:
        self.block(json.dumps(value, ensure_ascii=False, indent=2), "json")

    def begin(self, case: Case, arguments: dict[str, object]) -> None:
        self.case = case.name
        self.write(f"## {case.name}\n\nExpected: {case.expected}\n\nRequest:\n\n")
        self.json({"method": "tools/call", "params": {"name": case.tool, "arguments": arguments}})

    def verdict(self) -> None:
        self.write("Reader verdict:\n\n____________________\n\n")

    def note(self, text: str) -> None:
        self.write(f"Harness observation (not a server response): {text}\n\n")

    def close(self) -> None:
        self.file.close()


class RecordingStream(httpx.AsyncByteStream):
    def __init__(self, stream: httpx.AsyncByteStream, transcript: Transcript,
                 exchange: int, case: str, response: httpx.Response):
        self.stream, self.transcript = stream, transcript
        self.exchange, self.case, self.response = exchange, case, response
        self.chunks: list[bytes] = []
        self.complete = False
        self.recorded = False

    async def __aiter__(self):
        try:
            async for chunk in self.stream:
                self.chunks.append(chunk)
                yield chunk
            self.complete = True
        finally:
            self.record()

    def record(self) -> None:
        if self.recorded:
            return
        self.recorded = True
        body = b"".join(self.chunks)
        if self.transcript.key.encode("utf-8") in body:
            raise HarnessConfigurationError("Credential found in response; unsafe content was not written.")
        self.transcript.write(f"### HTTP response {self.exchange} · {self.case}\n\n"
                              f"Status: {self.response.status_code}; body complete: {self.complete}\n\n"
                              f"Content type: {self.response.headers.get('content-type', '')}\n\n"
                              "Raw response body:\n\n")
        try:
            text = body.decode("utf-8")
            self.transcript.block(text)
        except UnicodeDecodeError:
            self.transcript.write("Non-UTF-8 body, losslessly encoded as base64:\n\n")
            self.transcript.block(base64.b64encode(body).decode("ascii"))
        if self.complete:
            try:
                message = json.loads(body)
                if isinstance(message, dict):
                    self.transcript.responses.append(message)
            except (ValueError, UnicodeDecodeError):
                pass  # SSE stays verbatim; no JSON interpretation is claimed.

    async def aclose(self) -> None:
        try:
            await self.stream.aclose()
        finally:
            self.record()


class RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self, transcript: Transcript):
        self.inner = httpx.AsyncHTTPTransport()
        self.transcript = transcript

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.transcript.sequence += 1
        exchange, case = self.transcript.sequence, self.transcript.case
        body = await request.aread()
        self.transcript.write(f"### HTTP request {exchange} · {case}\n\n"
                              f"Method: {request.method}\n\nRaw request body:\n\n")
        self.transcript.block(body.decode("utf-8"))
        response = await self.inner.handle_async_request(request)
        response.stream = RecordingStream(response.stream, self.transcript, exchange, case, response)
        return response

    async def aclose(self) -> None:
        await self.inner.aclose()


def raw_result(transcript: Transcript, first: int) -> dict[str, object] | None:
    for message in reversed(transcript.responses[first:]):
        result = message.get("result")
        if isinstance(result, dict) and "content" in result:
            return result
    return None


def evidence_observation(transcript: Transcript, result: dict[str, object] | None) -> None:
    structured = result.get("structuredContent") if result else None
    evidence_id = structured.get("evidenceId") if isinstance(structured, dict) else None
    if isinstance(evidence_id, str):
        transcript.note(f"The answer returned evidence id {evidence_id}. The advertised MCP "
                        "tools expose no evidence lookup. No operator credentials or invented "
                        "lookup request were used. See findings.md, H-001.")
    else:
        transcript.note("No answer evidence id was returned in this case; evidence retrieval "
                        "could not be exercised. Inspect the raw response. See H-001 for "
                        "the current agent-interface limitation.")


async def run(behaviour: str, cases: list[Case], framework: bool = False) -> Path:
    config = Configuration.read()
    prepared = [(case, case.arguments()) for case in cases]
    transcript = Transcript(behaviour, config)
    # SDK/framework logging is not an additional transcript or credential sink.
    logging.disable(logging.CRITICAL)
    try:
        async with httpx.AsyncClient(
            transport=RecordingTransport(transcript),
            headers={"Authorization": f"Bearer {config.key}",
                     "X-Opintel-Agent-Id": config.agent_id, "Accept-Encoding": "identity"},
            timeout=httpx.Timeout(30, read=300), follow_redirects=False, trust_env=False,
        ) as http:
            async with streamable_http_client(config.endpoint, http_client=http) as streams:
                async with ClientSession(streams[0], streams[1]) as session:
                    await session.initialize()
                    transcript.case = "advertised tools"
                    listing = await session.list_tools()
                    transcript.verdict()
                    tools = {}
                    if framework:
                        # A deliberate local comparison must not inherit external tracing.
                        os.environ["LANGSMITH_TRACING"] = "false"
                        os.environ["LANGCHAIN_TRACING_V2"] = "false"
                        from langchain_mcp_adapters.tools import load_mcp_tools
                        transcript.write(f"Framework: langchain-mcp-adapters "
                                         f"{version('langchain-mcp-adapters')}; "
                                         f"langchain-core {version('langchain-core')}\n\n")
                        tools = {tool.name: tool for tool in await load_mcp_tools(session)}
                    for index, (case, arguments) in enumerate(prepared):
                        transcript.begin(case, arguments)
                        first = len(transcript.responses)
                        try:
                            if framework:
                                tool = tools.get(case.tool)
                                if tool is None:
                                    transcript.note("The framework has no advertised tool for this case.")
                                    transcript.verdict()
                                    continue
                                message = await tool.ainvoke({"type": "tool_call", "id": f"harness-{index}",
                                                            "name": tool.name, "args": arguments})
                                transcript.write("LangChain result (framework interpretation):\n\n")
                                transcript.json(message.model_dump(mode="json"))
                                compare_framework(transcript, raw_result(transcript, first), message)
                            else:
                                await session.call_tool(case.tool, arguments)
                            if case.name == "answer evidence reference":
                                evidence_observation(transcript, raw_result(transcript, first))
                                transcript.note("Advertised tools: " + ", ".join(t.name for t in listing.tools))
                        except Exception as error:
                            transcript.note(f"Client/framework exception type: {type(error).__name__}. "
                                            "Exception text is withheld; inspect the captured server response.")
                        transcript.verdict()
    except Exception as error:
        transcript.note(f"Run incomplete: {type(error).__name__}. Exception text withheld. "
                        "No successful run or server response is inferred.")
        transcript.verdict()
        raise
    finally:
        transcript.close()
    return transcript.path


def compare_framework(transcript: Transcript, raw: dict[str, object] | None, message: object) -> None:
    if raw is None:
        transcript.note("No complete JSON tool response available for framework comparison.")
        return
    artifact = getattr(message, "artifact", None)
    content = getattr(message, "content", None)
    # Compare exact text blocks; differences remain visible, never normalised away.
    raw_blocks = raw.get("content")
    expected_content = raw_blocks
    if isinstance(raw_blocks, list) and len(raw_blocks) == 1 and isinstance(raw_blocks[0], dict):
        if raw_blocks[0].get("type") == "text" and isinstance(content, str):
            expected_content = raw_blocks[0].get("text")
    raw_text = [block.get("text") for block in raw_blocks if isinstance(block, dict) and block.get("type") == "text"] if isinstance(raw_blocks, list) else []
    framework_text = [content] if isinstance(content, str) else [block.get("text") for block in content if isinstance(block, dict) and block.get("type") == "text"] if isinstance(content, list) else []
    transcript.write("Framework preservation observations (not human verdicts):\n\n")
    transcript.json({
        "content_equal": content == expected_content,
        "text_blocks_equal": framework_text == raw_text,
        "structured_content_equal": (artifact.get("structured_content") if isinstance(artifact, dict) else None) == raw.get("structuredContent"),
        "meta_equal": (artifact.get("_meta") if isinstance(artifact, dict) else None) == raw.get("_meta"),
        "error_status_equal": getattr(message, "status", None) == ("error" if raw.get("isError", False) else "success"),
        "server_structuredContent": raw.get("structuredContent"),
        "server_meta": raw.get("_meta"),
        "server_isError": raw.get("isError", False),
        "framework_artifact": artifact,
        "framework_status": getattr(message, "status", None),
    })


def main(behaviour: str, cases: list[Case], framework: bool = False) -> None:
    try:
        path = asyncio.run(run(behaviour, cases, framework))
        print(f"Transcript: {path.relative_to(ROOT.parent)}")
    except HarnessConfigurationError as error:
        # Configuration errors contain only fixed text and variable names.
        print(f"Harness configuration/capture error: {error}", file=sys.stderr)
        raise SystemExit(1) from None
    except Exception as error:
        print(f"Harness run incomplete ({type(error).__name__}); inspect the dated transcript.", file=sys.stderr)
        raise SystemExit(1) from None
