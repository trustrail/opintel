"""External S4 controller: fixtures, receiver, scanner and reports stay here.

No expected row value is embedded in Engine source, arguments or environment.
The application case uses the real MCP/authorization/durable evidence path.
"""
import contextlib
from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import queue
import re
import secrets
import ssl
import subprocess
import sys
import threading
import time
import uuid

from scanner import Scanner, descendants, frozen, observed_writes

REPORTS = Path("/reports")
SINKS = Path("/sinks")
CONTROL = Path("/control")
EXCLUSIONS = ["/proc", "/sys", "/dev", "/reports"]


def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def token(value):
    raw = hmac.new(bytes([1]) * 32, b"v1\0stdtext1\0customer\0" + value.encode(), hashlib.sha256).digest()[:16]
    number = int.from_bytes(raw, "big") << 2
    alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    return "v1_customer_" + "".join(alphabet[(number >> (125 - i * 5)) & 31] for i in range(26))


def sql(statement):
    # This process is outside the observed Engine/application process tree.
    result = subprocess.run(["psql", os.environ["TEST_DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-At"], input=statement, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("source_fixture_failed")
    return result.stdout


def new_marker():
    return "S4_" + secrets.token_hex(32)


class Target:
    def __init__(self, case):
        self.case = case
        self.events = []
        self.messages = queue.Queue()
        self.trace = REPORTS / (case + "-syscalls-" + uuid.uuid4().hex)
        self.log = SINKS / (case + ".log")
        self.log_handle = self.log.open("wb")
        self.process = subprocess.Popen([
            "strace", "--seccomp-bpf", "-ttt", "-T", "-u", "nobody", "-ff", "-yy", "-xx", "-s", "16777216", "-o", str(self.trace),
            "-e", "trace=write,writev,pwrite64,pwritev,pwritev2,openat,open,creat,close,unlink,unlinkat,rename,renameat,renameat2,mkdir,truncate,ftruncate,link,symlink,mmap,munmap,msync,sendfile,copy_file_range,splice,io_uring_setup,io_uring_enter,io_uring_register",
            "node", "--import", "tsx", "scripts/ephemerality/infrastructure/target.ts",
        ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log_handle, text=True, bufsize=1)
        def read():
            try:
                for line in self.process.stdout:
                    self.messages.put(json.loads(line))
            except Exception:
                self.messages.put({"event": "protocol_failure"})
            self.messages.put({"event": "exited"})
        self.reader = threading.Thread(target=read, daemon=True)
        self.reader.start()

    def send(self, **value):
        self.process.stdin.write(json.dumps(value) + "\n")
        self.process.stdin.flush()

    def until(self, event, timeout=180):
        deadline = time.monotonic() + timeout
        while True:
            item = self.messages.get(timeout=max(0.1, deadline - time.monotonic()))
            self.events.append(item)
            if item["event"] == event:
                return item
            if item["event"] in ("exited", "protocol_failure"):
                raise RuntimeError("target_" + item["event"])

    def stop(self):
        if self.process.poll() is None:
            self.send(op="stop")
            try:
                self.process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                # Failure to shut down is incomplete; never silently discard it.
                self.process.kill()
                self.process.wait()
                raise RuntimeError("target_shutdown_timeout")
        self.log_handle.close()


def request_for(kind, scenario):
    project, pool, source = [str(uuid.uuid4()) for _ in range(3)]
    columns = [{"sourceIdentifier": "id", "exposedName": "id", "exposedType": "INTEGER", "treatment": "clear", "readAs": "native", "elementId": str(uuid.uuid4())}]
    table = "plain" if kind == "clear" else "treated" if kind == "treated" else "aggregate_values"
    expected_names = ["clear"] if kind == "clear" else ["clear", "tokenized", "masked"] if kind == "treated" else ["aggregate_value"]
    for name in expected_names:
        treatment = {"tokenized": "tokenized", "masked": "masked", "aggregate_value": "aggregate_only"}.get(name, "clear")
        column = {"sourceIdentifier": name, "exposedName": name, "exposedType": "VARCHAR", "treatment": treatment, "readAs": "text" if treatment in ("tokenized", "masked") else "native", "elementId": str(uuid.uuid4())}
        if treatment == "tokenized":
            column["token"] = {"domain": "customer", "canonId": "stdtext1", "mode": "text", "caseInsensitive": False}
        if treatment == "masked":
            column["mask"] = {"kind": "all"}
        columns.append(column)
    entitlements = [{"elementId": c["elementId"], "treatment": c["treatment"]} for c in columns]
    entitlements.append({"elementId": str(uuid.uuid4()), "treatment": "withheld"})
    statement = "SELECT " + ",".join(expected_names) + " FROM records ORDER BY id"
    if kind == "aggregate":
        statement = "SELECT count(aggregate_value) FROM records"
    return {
        "requestId": "s4-" + scenario, "projectId": project, "poolId": pool, "policyVersion": 1,
        "tokenKeyVersionSelected": 1, "sql": statement, "namespace": {"catalog": "memory", "schema": "main"},
        "sources": [{"sourceId": source, "credentialRef": "secret://test/source"}], "entitlements": entitlements,
        "objects": [{"catalog": "memory", "schema": "main", "name": "records", "sourceId": source, "readPlan": {"catalog": "memory", "schema": "s4_source", "object": table, "columns": columns}}],
        "aggregateMinGroupSize": 5, "limits": {"memoryMb": 8 if scenario == "memory_pressure" else 256, "threads": 1, "timeoutMs": 500000, "rowLimit": 100000, "concurrency": 1},
        "settings": {"maxStagingRows": 100000, "maxQueuedExecutions": 1}, "entitlementContext": None,
    }


def receive(connection, path, body, headers):
    connection.request("POST", path, body=json.dumps(body), headers=headers)
    response = connection.getresponse()
    data = response.read().decode()
    if data.startswith("event:") or data.startswith("data:"):
        data = "\n".join(line[6:] for line in data.splitlines() if line.startswith("data: "))
    return response.status, json.loads(data)


def snapshot(target, ready, scanner, name):
    result = {"checkpoint": name, "complete": True, "incomplete": [], "scanRequestedAtUnixSeconds": time.time()}
    try:
        with frozen(ready["pid"]) as pids:
            result["frozenAtUnixSeconds"] = time.time()
            result["memory"] = [scanner.memory(pid) for pid in pids]
            result["heapControls"] = [{"name": allocation["name"], **scanner.allocation(ready["pid"], allocation["start"], allocation["size"])} for allocation in ready["ranges"]]
            # Open unlinked regular files are not discoverable by a directory walk.
            deleted = []
            for pid in pids:
                for fd in Path(f"/proc/{pid}/fd").iterdir():
                    try:
                        destination = os.readlink(fd)
                        if destination.endswith(" (deleted)") and os.path.isfile(fd):
                            deleted.append(scanner.file(fd))
                    except OSError as exc:
                        result["incomplete"].append({"pid": pid, "fd": fd.name, "reason": type(exc).__name__})
            result["openUnlinkedFiles"] = deleted
            roots = ["/", "/dev/shm"] if name == "immediate_after_response_no_forced_gc" else ["/control/live.bin", "/sinks", "/dev/shm"]
            result["filesystemRoots"] = roots
            result["filesystem"] = scanner.filesystem(roots, EXCLUSIONS)
    except Exception as exc:
        result["incomplete"].append({"reason": type(exc).__name__})
    result["complete"] = not result["incomplete"] and all(item["complete"] for item in result.get("memory", [])) and result.get("filesystem", {}).get("complete", False)
    live_file = next((item for item in result.get("filesystem", {}).get("matches", []) if item["path"] == "/control/live.bin"), None)
    result["controlsFound"] = all(item["complete"] and any(key.startswith(item["name"] + ":") for key in item["counts"]) for item in result.get("heapControls", [])) and len(result.get("heapControls", [])) == len(ready["ranges"]) and live_file is not None and all(any(key.startswith(item["name"] + ":") for key in live_file["counts"]) for item in ready["ranges"])
    return result


def main(case):
    REPORTS.mkdir(exist_ok=True); SINKS.mkdir(exist_ok=True); CONTROL.mkdir(exist_ok=True)
    REPORTS.chmod(0o700)
    CONTROL.chmod(0o777)
    markers = {name: new_marker() for name in ["clear", "mixed_clear", "token_plain", "masked_plain", "aggregate", "withheld", "undecided", "application", "query_literal", "query_alias", "heap_utf8", "heap_utf16"]}
    expected_token = token(markers["token_plain"])
    markers["token_output"] = expected_token
    controls = [{"name": "heap_utf8", "value": markers["heap_utf8"], "encoding": "utf8"}, {"name": "heap_utf16", "value": markers["heap_utf16"], "encoding": "utf16le"}]
    scanner = Scanner(markers)
    report = {"case": case, "status": "INCOMPLETE", "failures": [], "incomplete": [], "checkpoints": [], "memoryResiduals": [], "scope": {
        "filesystem": "container regular files, writable layer and mounts, /dev/shm, open unlinked files; root scan plus syscall writes",
        "telemetry": "actual stdout/stderr logs; production span exporter is not configured (no invented span proof)",
        "exclusions": {"/proc": "memory and descriptors inspected through explicit APIs", "/sys": "kernel virtual filesystem", "/dev": "devices; /dev/shm scanned separately", "/reports": "external controller's syscall records and reports, not writable by target code", "sourceDatabase": "legitimate original values", "receiver": "authorized external response verifier"},
        "deployment": "test container, not S5 production-image proof; swap disabled/core limit zero in test configuration",
        "ioBackend": "Docker default seccomp and UV_USE_IO_URING=0: syscall-observable backend. Successful io_uring activity, shared file stores and zero-copy writes are incomplete, never treated as zero matches",
        "rawHostDiskKernelHypervisor": "outside container-level proof",
    }}
    # The target is allowed no access to report files. The controller stays root,
    # target drops privileges through strace's -u in the runner (see below).
    target = None
    try:
        report["phase"] = "fixture"
        # A tracing implementation added later must not inherit today's absence
        # claim. It needs a collector/export coverage adapter and controls.
        dependencies = json.loads(Path("/work/package.json").read_text())
        tracing = any(name.startswith("@opentelemetry/") for section in ("dependencies", "devDependencies") for name in dependencies.get(section, {}))
        tracing = tracing or any(name.startswith("OTEL_") for name in os.environ) or bool(os.environ.get("NODE_OPTIONS"))
        tracing = tracing or any(re.search(r"@opentelemetry|start(?:Active)?Span\s*\(", path.read_text()) for directory in ("/work/src", "/work/sidecar") for path in Path(directory).rglob("*.ts"))
        if tracing:
            report["incomplete"].append("tracing_detected_without_export_coverage_adapter")
        if case != "application":
            values = [markers[name] for name in ["clear", "mixed_clear", "token_plain", "masked_plain", "aggregate", "withheld", "undecided"]]
            sql("DROP SCHEMA IF EXISTS s4_source CASCADE; CREATE SCHEMA s4_source; "
                "CREATE TABLE s4_source.plain AS SELECT i::integer AS id,'" + values[0] + "'::text AS clear,'" + values[5] + "'::text AS withheld,'" + values[6] + "'::text AS undecided FROM generate_series(1,100000) i; "
                "CREATE TABLE s4_source.treated AS SELECT i::integer AS id,'" + values[1] + "'::text AS clear,'" + values[2] + "'::text AS tokenized,'" + values[3] + "'::text AS masked,'" + values[5] + "'::text AS withheld,'" + values[6] + "'::text AS undecided FROM generate_series(1,100000) i; "
                "CREATE TABLE s4_source.aggregate_values AS SELECT i::integer AS id,'" + values[4] + "'::text AS aggregate_value FROM generate_series(1,100000) i; "
                "ANALYZE s4_source.plain; ANALYZE s4_source.treated; ANALYZE s4_source.aggregate_values;")
        target = Target(case)
        report["phase"] = "target_start"
        target.send(op="start", mode="application" if case == "application" else "engine", controls=controls)
        ready = target.until("ready")
        report["runtime"] = {"node": ready["nodeVersion"], "gcForced": False}
        report["phase"] = "positive_controls"
        baseline = snapshot(target, ready, scanner, "positive_controls_before_query")
        report["checkpoints"].append(baseline)
        if not baseline["controlsFound"]:
            report["failures"].append("heap_positive_control_missing")
        file_controls = scanner.file("/control/live.bin")
        if not all(any(key.startswith(control["name"] + ":") for key in file_controls["counts"]) for control in controls):
            report["failures"].append("filesystem_positive_control_missing")
        context = ssl.create_default_context(cafile="/control/tls-config/tls/ca.pem")
        context.load_cert_chain("/control/tls-config/tls/client.pem", "/control/tls-config/tls/client.key")
        report["phase"] = "request"
        if case == "application":
            schema = ready["schema"]
            sql(f"TRUNCATE {schema}.records; INSERT INTO {schema}.records SELECT i,1000+i,10,'{markers['application']}','{markers['withheld']}','{markers['undecided']}' FROM generate_series(1,100000) i; ANALYZE {schema}.records;")
            # Project configuration owns the row limit, not an agent override.
            # Updating metadata remains through its existing scoped test fixture.
            target.send(op="scenario", name="success"); target.until("configured")
            from urllib.parse import urlparse
            url = urlparse(ready["url"])
            connection = http.client.HTTPConnection(url.hostname, url.port, timeout=540)
            headers = {"x-opintel-agent-id": "unverified-agent", "mcp-protocol-version": "2025-03-26", "authorization": "Bearer " + ready["key"], "mcp-session-id": ready["session"], "content-type": "application/json", "accept": "application/json, text/event-stream"}
            # Keep this application's configured 100-row delivery cap; the direct
            # Engine cases independently verify 100k delivered rows.
            body = {"jsonrpc": "2.0", "id": 10, "method": "tools/call", "params": {"name": "opintel.query", "arguments": {"sql": "SELECT field_4 FROM warehouse.public.records"}}}
            status, response = receive(connection, url.path, body, headers)
            result = response.get("result", {})
            rows = result.get("structuredContent", {}).get("rows", [])
            report["applicationOutcome"] = {key: result.get("_meta", {}).get(key) for key in ("code", "cause", "retryable")}
            if status != 200 or result.get("isError") or not rows or any(row != [markers["application"]] for row in rows):
                report["failures"].append("application_delivery_failed")
            report["responseCompletedAtUnixSeconds"] = time.time()
            report["delivery"] = {"rows": len(rows), "status": status, "authorizedBoundary": "external MCP receiver"}
            connection.close()
            report["checkpoints"].append(snapshot(target, ready, scanner, "immediate_after_response_no_forced_gc"))
            target.send(op="evidence"); evidence = target.until("evidence")
            evidence_check = scanner.stream(__import__("io").BytesIO(json.dumps(evidence["contents"]).encode()))
            report["evidence"] = {"runs": evidence["count"], "records": evidence["counts"], **evidence_check}
            if evidence["count"] != 1 or evidence["counts"].get("query_run") != 1 or evidence["counts"].get("run_completion") != 1 or evidence_check["counts"]:
                report["failures"].append("durable_evidence_result_value_or_missing_record")
        else:
            scenario = case if case in ["cancel", "deadline", "source_failure", "staging_failure", "memory_pressure"] else "success"
            kind = "clear" if case == "clear" else "aggregate" if case == "aggregate" else "treated"
            target.send(op="scenario", name=scenario); target.until("configured")
            request = request_for(kind, scenario)
            if case == "clear":
                request["sql"] = 'SELECT clear AS "' + markers["query_alias"] + '" FROM records WHERE clear <> \'' + markers["query_literal"] + "' ORDER BY id"
            connection = http.client.HTTPSConnection("127.0.0.1", ready["port"], context=context, timeout=540)
            headers = {"content-type": "application/json"}
            with ThreadPoolExecutor(max_workers=1) as workers:
                pending = workers.submit(receive, connection, "/execute", request, headers)
                if scenario in ("cancel", "deadline"):
                    target.until("gate")
                    report["checkpoints"].append(snapshot(target, ready, scanner, "partial_staging_before_interruption"))
                    if scenario == "cancel":
                        # Disconnect the real mTLS caller; the host owns abort.
                        connection.sock.shutdown(__import__("socket").SHUT_RDWR)
                        connection.close()
                    else:
                        target.send(op="expire")
                try:
                    status, response = pending.result(timeout=540)
                except (OSError, http.client.HTTPException):
                    if scenario != "cancel":
                        raise
                    status, response = 0, {}
                teardown = target.until("teardown")
                connection.close()
            report["responseCompletedAtUnixSeconds"] = time.time()
            report["sourceBackendsAfterResponse"] = int(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='opintel-sidecar-connector' OR application_name LIKE 'opintel-scan-%'"))
            if report["sourceBackendsAfterResponse"]:
                report["failures"].append("source_backend_still_open_after_response")
            spill = [event for event in target.events if event["event"] == "spill"]
            report["spillConfiguration"] = spill
            if len(spill) != teardown["opened"] or any(event["rows"] != [["", "0 bytes"]] for event in spill):
                report["failures"].append("spill_not_disabled_in_every_session")
            report["teardown"] = teardown
            if teardown["opened"] != teardown["closed"] or teardown["prepared"] != teardown["released"] or teardown["sourceOpen"] != 0:
                report["failures"].append("resources_not_closed_before_serialization")
            report["checkpoints"].append(snapshot(target, ready, scanner, "immediate_after_response_no_forced_gc"))
            if scenario == "success":
                expected = [markers["clear"]] if kind == "clear" else [markers["mixed_clear"], expected_token, "****"] if kind == "treated" else ["100000"]
                count = 1 if kind == "aggregate" else 100000
                if status != 200 or len(response.get("rows", [])) != count or any(row != expected for row in response.get("rows", [])):
                    report["failures"].append("authorized_delivery_or_treatment_failed")
                expected_names = ["id", "clear"] if kind == "clear" else ["id", "clear", "tokenized", "masked"] if kind == "treated" else ["id", "aggregate_value"]
                hashes = {name: digest([[value]]) for name, value in zip(expected_names[1:], expected if kind != "aggregate" else [markers["aggregate"]])}
                staged = [event for event in target.events if event["event"] == "staged"]
                report["staging"] = staged
                if len(staged) != 2 or any(event["count"] != 100000 or event["names"] != expected_names or event["hashes"] != hashes for event in staged):
                    report["failures"].append("privileged_or_agent_live_staging_failed")
                appends = [event for event in target.events if event["event"] == "append"]
                if kind == "treated" and (not appends or sum(event["count"] for event in appends) != 100000 or any(event["names"] != expected_names or event["hashes"] != {name: [value] for name, value in hashes.items()} for event in appends)):
                    report["failures"].append("treated_append_boundary_failed")
                report["delivery"] = {"rows": len(response.get("rows", [])), "status": status}
            else:
                expected_code = "budget_exceeded" if scenario in ("cancel", "deadline", "memory_pressure") else "source_unavailable"
                allowed_codes = {"budget_exceeded", "source_unavailable"} if scenario == "memory_pressure" else {expected_code}
                if teardown["ok"] or teardown.get("code") not in allowed_codes or "rows" in response:
                    report["failures"].append("refusal_or_interruption_failed")
                if scenario == "memory_pressure":
                    native = [event for event in target.events if event["event"] == "native_staging_failure"]
                    report["nativeFailure"] = native
                    if not native or not all(event["memoryExhausted"] for event in native):
                        report["failures"].append("native_memory_pressure_not_established")
                if teardown["appendedRows"] < 1:
                    report["failures"].append("failure_did_not_follow_partial_staging")
        report["phase"] = "write_observation"
        target.stop()
        observation = observed_writes(sorted(REPORTS.glob(target.trace.name + ".*")), scanner)
        report["syscallArtifacts"] = [str(path) for path in sorted(REPORTS.glob(target.trace.name + ".*"))]
        report["writeObservation"] = observation
        if not observation["complete"]:
            report["incomplete"].append("filesystem_write_observation_incomplete")
        if not any(item["sink"].startswith("/control/transient.bin") and any(key.startswith("heap_utf8:") for key in item["counts"]) for item in observation["matches"]):
            report["failures"].append("transient_write_positive_control_missing")
        if observation["mappedWritableFiles"]:
            report["incomplete"].append("shared_writable_file_mapping_requires_store_observation")
        for item in observation["fileWrites"]:
            if not item["sink"].startswith(("/control/", "/sinks/", "/tmp/tsx-", "/tmp/opintel-query-")):
                report["incomplete"].append("unclassified_filesystem_write:" + item["sink"])
        for checkpoint in report["checkpoints"]:
            if not checkpoint["complete"]:
                report["incomplete"].append(checkpoint["checkpoint"] + ":scan_coverage_incomplete")
            if not checkpoint["controlsFound"]:
                report["failures"].append(checkpoint["checkpoint"] + ":live_heap_control_missing")
            for memory in checkpoint.get("memory", []):
                if any(any(key.startswith(("withheld:", "undecided:")) for key in item["counts"]) for item in memory["matches"]):
                    report["failures"].append("unreadable_column_reached_process_memory")
                residuals = [{**item, "counts": {key: value for key, value in item["counts"].items() if not key.startswith("heap_")}} for item in memory["matches"]]
                residuals = [item for item in residuals if item["counts"]]
                report["memoryResiduals"].append({"checkpoint": checkpoint["checkpoint"], "pid": memory["pid"], "bytesScanned": memory["bytes"], "matches": residuals})
            for item in checkpoint.get("filesystem", {}).get("matches", []) + checkpoint.get("openUnlinkedFiles", []):
                if any(not key.startswith("heap_") for key in item["counts"]) or any(not key.startswith("heap_") for key in item.get("pathMatches", {}).get("counts", {})) or any(any(not key.startswith("heap_") for key in member["counts"]) for member in item.get("decoded", [])):
                    report["failures"].append("persistent_workload_marker:" + item["path"])
        for item in observation["matches"]:
            # Source query traffic and authorized response delivery are explicit
            # transport boundaries, not persistent sinks. Pipes and files are
            # still checked; raw values in harness metadata are a failure too.
            workload = {key: value for key, value in {**item["counts"], **(item.get("pathMatches") or {}).get("counts", {})}.items() if not key.startswith("heap_")}
            if not workload:
                continue
            sink = item["sink"]
            source_query = sink.startswith("TCP:") and ":5432" in sink and case != "application" and all(key.startswith("query_literal:") for key in workload)
            receiver_port = ready.get("port") if case != "application" else __import__("urllib.parse", fromlist=["urlparse"]).urlparse(ready["url"]).port
            delivery = sink.startswith("TCP:") and "127.0.0.1:" + str(receiver_port) in sink
            if not source_query and not delivery:
                report["failures"].append("observed_workload_write:" + sink)
        log = scanner.file(target.log)
        report["telemetry"] = {"log": log, "spans": {"status": "INCOMPLETE" if tracing else "NOT_CONFIGURED", "reason": "export adapter missing" if tracing else "no production span exporter or tracing SDK detected"}}
        if not any(key.startswith("heap_utf8:") for key in log["counts"]):
            report["failures"].append("log_collection_positive_control_missing")
        if any(not key.startswith("heap_") for key in log["counts"]):
            report["failures"].append("telemetry_value_found")
        report["status"] = "FAILED" if report["failures"] else "INCOMPLETE" if report["incomplete"] else "VERIFIED"
        report["phase"] = "finished"
    except Exception as exc:
        import traceback
        report["incomplete"].append({"reason": type(exc).__name__, "frames": [{"file": frame.filename, "line": frame.lineno, "function": frame.name} for frame in traceback.extract_tb(exc.__traceback__)]})
    finally:
        if target:
            with contextlib.suppress(Exception):
                target.stop()
        # No row values or complete memory snapshots are exported in the report.
        REPORTS.joinpath(case + ".json").write_text(json.dumps(report, indent=2))
    summary = {"case": case, "status": report["status"], "failures": report["failures"], "incomplete": report["incomplete"], "residualMatches": sum(sum(item["counts"].values()) for checkpoint in report["memoryResiduals"] for item in checkpoint["matches"])}
    summary["postResponseResidualMatches"] = sum(sum(item["counts"].values()) for checkpoint in report["memoryResiduals"] if checkpoint["checkpoint"] == "immediate_after_response_no_forced_gc" for item in checkpoint["matches"])
    print(json.dumps(summary), flush=True)
    return 0 if report["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
