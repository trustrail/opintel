"""Raw agent transcript: two-share redemption, replay and recipient refusal.

Revocation is prepared outside this harness; operator credentials never enter it.
The crypto subprocess receives secrets on stdin, never in command arguments.
"""
import asyncio
import json
import logging
import os
import time
from pathlib import Path
import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from common import Configuration, Transcript, RecordingTransport, Case, HarnessConfigurationError


async def crypto(arguments):
    child = await asyncio.create_subprocess_exec(
        "node", str(Path(__file__).with_name("custody-crypto.mjs")),
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL)
    output, _ = await child.communicate(json.dumps(arguments).encode())
    if child.returncode:
        raise HarnessConfigurationError("Custody verification or unseal failed; no key was printed.")
    return json.loads(output)


async def run():
    config = Configuration.read()
    sql = os.environ.get("OPINTEL_HARNESS_CUSTODY_SQL", "").strip()
    if not sql:
        raise HarnessConfigurationError("Set OPINTEL_HARNESS_CUSTODY_SQL.")
    logging.disable(logging.CRITICAL)
    transcript = Transcript("custody", config)
    secondary = os.environ.get("OPINTEL_HARNESS_SECOND_POOL_KEY")
    transcript.secrets.extend(value for value in [secondary, os.environ.get("OPINTEL_XQ_ACCESS_TOKEN"), os.environ.get("OPINTEL_XQ_API_KEY")] if value)
    try:
        async with httpx.AsyncClient(transport=RecordingTransport(transcript),
                headers={"Authorization": "Bearer " + config.key,
                         "X-Opintel-Agent-Id": config.agent_id},
                follow_redirects=False, trust_env=False, timeout=30) as http:
            async with streamable_http_client(config.endpoint, http_client=http) as streams:
                async with ClientSession(streams[0], streams[1]) as session:
                    await session.initialize()
                    describe = await session.call_tool("opintel.describe", {})
                    keys = describe.structuredContent["custody"]["keys"]
                    transcript.begin(Case("redeem and unseal", "Both shares are required; only custody cells unseal.", "opintel.query"), {"sql": sql})
                    answer = await session.call_tool("opintel.query", {"sql": sql})
                    data = answer.structuredContent
                    if not data or not data.get("custody"):
                        transcript.note("No custody bundle was returned. Inspect the raw refusal.")
                        transcript.verdict()
                        return transcript.path
                    bundle = data["custody"][0]
                    grant = bundle["grant"]
                    claims = await crypto({"operation": "verify", "grant": grant, "keys": keys})
                    if secondary:
                        transcript.begin(Case("second alias", "The other credential receives neither share.", "opintel.redeem"), {"grant": grant})
                        async with httpx.AsyncClient(transport=RecordingTransport(transcript), headers={"Authorization": "Bearer " + secondary, "X-Opintel-Agent-Id": config.agent_id}, follow_redirects=False, trust_env=False, timeout=30) as other_http:
                            async with streamable_http_client(config.endpoint, http_client=other_http) as other_streams:
                                async with ClientSession(other_streams[0], other_streams[1]) as other:
                                    await other.initialize()
                                    await other.call_tool("opintel.redeem", {"grant": grant})
                            if claims["custody"]["provider"] == "local":
                                await other_http.post(claims["custody"]["provider_redeem_at"], json={"grant": grant})
                        transcript.verdict()
                    else:
                        transcript.note("Second-alias case not run: OPINTEL_HARNESS_SECOND_POOL_KEY is unset.")
                    transcript.case = "redeem and unseal"
                    if claims["custody"]["provider"] == "local":
                        first_response = await http.post(claims["custody"]["provider_redeem_at"], json={"grant": grant})
                        first_response.raise_for_status()
                        first = first_response.json()["share"]
                    else:
                        api_key, access_token = os.environ.get("OPINTEL_XQ_API_KEY"), os.environ.get("OPINTEL_XQ_ACCESS_TOKEN")
                        if not api_key or not access_token:
                            transcript.note("XQ K1 not redeemed: recipient credentials are absent. No live-provider claim is made.")
                            transcript.verdict()
                            return transcript.path
                        process = await asyncio.create_subprocess_exec("node", "--import", "tsx", str(Path(__file__).with_name("custody-xq.ts")), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
                        response, _ = await process.communicate(json.dumps({"locator": claims["custody"]["locator"], "alias": claims["sub"], "accessToken": access_token, "apiKey": api_key, "tenant": claims["custody"]["tenant"], "redeemAt": claims["custody"]["provider_redeem_at"]}).encode())
                        if process.returncode:
                            transcript.note("XQ K1 redemption refused. No key or SDK exception was printed.")
                            transcript.verdict()
                            return transcript.path
                        first = json.loads(response)["share"]
                        transcript.note("XQ adapter K1 response (separate from raw Opintel transport):")
                        transcript.json({"share": first})
                    second_result = await session.call_tool("opintel.redeem", {"grant": grant})
                    if second_result.isError:
                        transcript.note("K1 was obtained but K2 was refused; unseal is impossible. Inspect whether the grant expired or was revoked.")
                    else:
                        rows = await crypto({"operation": "unseal", "first": first,
                            "second": second_result.structuredContent["share"],
                            "receipt": data["evidenceId"], "columns": bundle["columns"],
                            "names": [c["name"] for c in data["columns"]], "rows": data["rows"]})
                        transcript.note("Agent-local unsealed rows (not an Opintel response):")
                        transcript.json(rows)
                    transcript.verdict()
                    transcript.begin(Case("replayed grant", "Neither share is released twice.", "opintel.redeem"), {"grant": grant})
                    await session.call_tool("opintel.redeem", {"grant": grant})
                    if claims["custody"]["provider"] == "local":
                        await http.post(claims["custody"]["provider_redeem_at"], json={"grant": grant})
                    transcript.verdict()
                    # Fresh grants keep these scenarios independent of single-use
                    # consumption in the first case. No operator identity is used.
                    if claims["custody"]["provider"] == "local" and secondary:
                        transcript.begin(Case("K2 first, other alias refused K1", "K2 alone cannot unseal; another alias cannot obtain K1.", "opintel.query"), {"sql": sql})
                        fresh = (await session.call_tool("opintel.query", {"sql": sql})).structuredContent
                        fresh_grant = fresh["custody"][0]["grant"]
                        fresh_claims = await crypto({"operation": "verify", "grant": fresh_grant, "keys": keys})
                        await session.call_tool("opintel.redeem", {"grant": fresh_grant})
                        async with httpx.AsyncClient(transport=RecordingTransport(transcript), headers={"Authorization": "Bearer " + secondary, "X-Opintel-Agent-Id": config.agent_id}, follow_redirects=False, trust_env=False, timeout=30) as other_http:
                            await other_http.post(fresh_claims["custody"]["provider_redeem_at"], json={"grant": fresh_grant})
                        transcript.verdict()
                    else:
                        transcript.note("K2-first/other-alias K1 scenario not run: requires local provider and a second pool key.")
                    if os.environ.get("OPINTEL_HARNESS_WAIT_FOR_EXPIRY") == "1" and claims["custody"]["provider"] == "local":
                        transcript.begin(Case("K1 obtained, K2 refused after expiry", "An expired grant cannot release K2 even with K1 already held.", "opintel.query"), {"sql": sql})
                        fresh = (await session.call_tool("opintel.query", {"sql": sql})).structuredContent
                        fresh_grant = fresh["custody"][0]["grant"]
                        fresh_claims = await crypto({"operation": "verify", "grant": fresh_grant, "keys": keys})
                        await http.post(fresh_claims["custody"]["provider_redeem_at"], json={"grant": fresh_grant})
                        transcript.note("Waiting for this grant's signed expiry; no timeout is changed.")
                        await asyncio.sleep(max(0, fresh_claims["exp"] - time.time() + 1))
                        await session.call_tool("opintel.redeem", {"grant": fresh_grant})
                        transcript.verdict()
                    else:
                        transcript.note("Expiry transcript not run: enable OPINTEL_HARNESS_WAIT_FOR_EXPIRY=1 with local custody; it waits for the actual signed expiry.")
                    if os.environ.get("OPINTEL_HARNESS_STOP_APPLICATION") == "1" and claims["custody"]["provider"] == "local":
                        transcript.begin(Case("Opintel unavailable", "A held K1 cannot unseal while Opintel cannot release K2.", "opintel.query"), {"sql": sql})
                        fresh = (await session.call_tool("opintel.query", {"sql": sql})).structuredContent
                        fresh_grant = fresh["custody"][0]["grant"]
                        fresh_claims = await crypto({"operation": "verify", "grant": fresh_grant, "keys": keys})
                        await http.post(fresh_claims["custody"]["provider_redeem_at"], json={"grant": fresh_grant})
                        await asyncio.to_thread(input, "Stop this synthetic Opintel instance externally, then press Enter. No operator credentials enter the harness: ")
                        try:
                            await asyncio.wait_for(session.call_tool("opintel.redeem", {"grant": fresh_grant}), timeout=30)
                            transcript.note("The application responded: the unavailable-Opintel condition was not established. Inspect the raw result; do not count this as a successful outage case.")
                        except Exception as error:
                            transcript.note("K2 call failed (" + type(error).__name__ + "); no K2 was received and no unseal was attempted. Inspect the deliberately stopped service to distinguish transport failure from another client failure; exception content is withheld.")
                        transcript.verdict()
                    else:
                        transcript.note("Outage transcript not run: OPINTEL_HARNESS_STOP_APPLICATION=1 requires a disposable local instance and a person to stop it after K1 is received.")
                    revoked = os.environ.get("OPINTEL_HARNESS_REVOKED_GRANT")
                    if revoked:
                        transcript.begin(Case("revoked grant", "A pre-revoked grant returns no K2. Revocation was prepared outside the agent harness.", "opintel.redeem"), {"grant": revoked})
                        await session.call_tool("opintel.redeem", {"grant": revoked})
                        transcript.verdict()
        return transcript.path
    finally:
        transcript.close()


if __name__ == "__main__":
    print(asyncio.run(run()))
