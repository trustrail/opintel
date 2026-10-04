"""S4 scanner. Never dumps matched bytes; reports coverage and counts.

The controller/strace output are evidence collectors, not target processes.
Kernel-owned vvar mappings and non-readable mappings are declared exclusions.
Unmapped/free physical pages are outside a /proc mapped-memory observation.
"""
import contextlib
import gzip
import io
import json
import os
from pathlib import Path
import re
import signal
import stat
import time
import zipfile

CHUNK = 1024 * 1024


class Scanner:
    def __init__(self, markers):
        self.patterns = {}
        self.groups = {}
        for name, value in markers.items():
            for encoding in ("utf-8", "utf-16le", "utf-16be"):
                encoded = value.encode(encoding)
                self.patterns[encoded] = name + ":" + encoding
                prefix = value[:3].encode(encoding).rstrip(b"\0")
                self.groups.setdefault(prefix, []).append(encoded)
        self.overlap = max(map(len, self.patterns)) - 1

    def stream(self, stream, size=None, offset=0):
        counts, samples = {}, []
        previous = b""
        position = 0
        while size is None or position < size:
            wanted = CHUNK if size is None else min(CHUNK, size - position)
            block = stream.read(wanted)
            if not block:
                if size is not None and position < size:
                    raise OSError("short_read")
                break
            data = previous + block
            # Non-zero family prefixes avoid a mixed-encoding regex probing
            # every zero byte in large unused heap regions. All actual needles
            # and all bytes are still checked; this is not a coverage shortcut.
            for prefix, needles in self.groups.items():
                found = data.find(prefix)
                while found >= 0:
                    for needle in needles:
                        if found + len(needle) <= len(previous) or not data.startswith(needle, found):
                            continue
                        name = self.patterns[needle]
                        counts[name] = counts.get(name, 0) + 1
                        if len(samples) < 12:
                            samples.append({"marker": name, "offset": offset + position - len(previous) + found})
                    found = data.find(prefix, found + 1)
            position += len(block)
            previous = data[-self.overlap:]
        return {"bytes": position, "counts": counts, "samples": samples, "sampleLimit": 12}

    def file(self, path):
        with open(path, "rb", buffering=0) as stream:
            magic = stream.read(4)
            stream.seek(0)
            report = self.stream(stream)
        report["path"] = str(path)
        report["pathMatches"] = self.stream(io.BytesIO(os.fsencode(path)))
        # Decode supported archive sinks; scanning compressed bytes alone is not
        # evidence that decoded values are absent. Unknown writes fail separately.
        if magic.startswith(b"\x1f\x8b"):
            with gzip.open(path, "rb") as decoded:
                report["decoded"] = [self.stream(decoded)]
        elif magic.startswith(b"PK\x03\x04"):
            with zipfile.ZipFile(path) as archive:
                report["decoded"] = []
                for name in archive.namelist():
                    if not name.endswith("/"):
                        with archive.open(name) as decoded:
                            report["decoded"].append({"member": name, **self.stream(decoded)})
        return report

    def filesystem(self, roots, excluded=()):
        report = {"complete": True, "bytes": 0, "files": 0, "matches": [], "incomplete": [], "exclusions": list(excluded)}
        seen = set()
        def error(path, exc):
            report["complete"] = False
            report["incomplete"].append({"path": str(path), "reason": type(exc).__name__})
        def scan(path):
            try:
                info = path.stat()
                if not stat.S_ISREG(info.st_mode):
                    return
                identity = (info.st_dev, info.st_ino)
                if identity in seen:
                    return
                seen.add(identity)
                item = self.file(path)
                report["files"] += 1
                report["bytes"] += item["bytes"]
                if item["counts"] or item["pathMatches"]["counts"] or any(decoded["counts"] for decoded in item.get("decoded", [])):
                    report["matches"].append(item)
            except OSError as exc:
                error(path, exc)
        for root in roots:
            root = Path(root)
            if not root.exists():
                error(root, FileNotFoundError())
                continue
            if root.is_file():
                scan(root)
                continue
            for directory, names, files in os.walk(root, onerror=lambda exc: error(exc.filename, exc), followlinks=False):
                names[:] = [name for name in names if not any(str(Path(directory, name)) == item for item in excluded)]
                for name in files:
                    path = Path(directory, name)
                    if not path.is_symlink():
                        scan(path)
        return report

    def memory(self, pid):
        report = {"pid": pid, "complete": True, "bytes": 0, "mappings": [], "matches": [], "incomplete": [], "exclusions": []}
        try:
            maps = Path(f"/proc/{pid}/maps").read_text().splitlines()
            with open(f"/proc/{pid}/mem", "rb", buffering=0) as memory:
                for line in maps:
                    parts = line.split(maxsplit=5)
                    address, permissions = parts[:2]
                    name = parts[5] if len(parts) > 5 else "anonymous"
                    if "r" not in permissions or name in ("[vvar]", "[vvar_vclock]", "[vsyscall]"):
                        report["exclusions"].append({"range": address, "mapping": name, "reason": "not_readable" if "r" not in permissions else "kernel_owned_clock_mapping"})
                        continue
                    start, end = [int(value, 16) for value in address.split("-")]
                    try:
                        memory.seek(start)
                        item = {"range": address, "mapping": name, **self.stream(memory, end - start, start)}
                        report["bytes"] += item["bytes"]
                        report["mappings"].append({"range": address, "bytes": item["bytes"], "mapping": name})
                        if item["counts"]:
                            report["matches"].append(item)
                    except OSError as exc:
                        report["complete"] = False
                        report["incomplete"].append({"range": address, "mapping": name, "reason": type(exc).__name__})
        except OSError as exc:
            report["complete"] = False
            report["incomplete"].append({"reason": type(exc).__name__})
        return report

    def allocation(self, pid, start, size):
        try:
            with open(f"/proc/{pid}/mem", "rb", buffering=0) as memory:
                memory.seek(int(start))
                return {"complete": True, **self.stream(memory, size, int(start))}
        except OSError as exc:
            return {"complete": False, "incomplete": [{"reason": type(exc).__name__}]}


def descendants(pid):
    result = {pid}
    pending = [pid]
    while pending:
        parent = pending.pop()
        for task in Path(f"/proc/{parent}/task").iterdir():
            for child in task.joinpath("children").read_text().split():
                child = int(child)
                if child not in result:
                    result.add(child)
                    pending.append(child)
    return sorted(result)


@contextlib.contextmanager
def frozen(pid):
    stopped = []
    try:
        deadline = time.monotonic() + 10
        # Stop the root first, then discover and stop children until the whole
        # tree is stable. A child created during discovery must not escape.
        pending = [pid]
        while pending:
            for child in pending:
                os.kill(child, signal.SIGSTOP)
                stopped.append(child)
                while True:
                    states = [task.joinpath("status").read_text() for task in Path(f"/proc/{child}/task").iterdir()]
                    if all(re.search(r"State:\s+[tT]", state) for state in states):
                        break
                    if time.monotonic() > deadline:
                        raise RuntimeError("process_did_not_stop")
                    time.sleep(0.01)
            pids = descendants(pid)
            pending = [child for child in pids if child not in stopped]
        yield pids
    finally:
        for child in reversed(stopped):
            with contextlib.suppress(ProcessLookupError):
                os.kill(child, signal.SIGCONT)


def unhex(text):
    return bytes.fromhex(text.replace("\\x", ""))


def observed_writes(paths, scanner):
    """strace -ff -yy -xx -s 16777216; truncated payloads are incomplete.

    File offsets are not required for leak detection: every successful write's
    captured bytes are searched, even when the file is subsequently unlinked.
    """
    report = {"complete": True, "writes": 0, "mutations": 0, "bytes": 0, "matches": [], "incomplete": [], "fileWrites": [], "mappedWritableFiles": []}
    import heapq
    tails, last_ends = {}, {}
    def calls(path):
        pending = None
        try:
            with Path(path).open() as trace:
                for ordinal, raw in enumerate(trace):
                    timed = re.match(r"(\d+\.\d+)\s+(.*)", raw)
                    timestamp, line = (float(timed[1]), timed[2]) if timed else (float(ordinal), raw.rstrip())
                    if "<unfinished ...>" in line:
                        pending = (timestamp, line.split("<unfinished ...>")[0])
                        continue
                    if " resumed>" in line:
                        if pending is None:
                            report["incomplete"].append({"trace": str(path), "reason": "unpaired_resumed_call"})
                            continue
                        started, call = pending
                        line = call + line.split(" resumed>", 1)[1]
                        pending = None
                    else:
                        started = timestamp
                    duration = re.search(r" <(\d+\.\d+)>$", line)
                    ended = max(timestamp, started + float(duration[1]) if duration else started)
                    yield started, str(path), ended, line
                if pending:
                    report["incomplete"].append({"trace": str(path), "reason": "unfinished_call"})
        except OSError as exc:
            report["incomplete"].append({"trace": str(path), "reason": type(exc).__name__})
    for started, path, ended, line in heapq.merge(*(calls(path) for path in paths)):
        if re.match(r"(?:open|unlink|rename|mkdir|truncate|ftruncate|creat|link|symlink)", line):
            report["mutations"] += 1
        if line.startswith("mmap(") and "PROT_WRITE" in line and "MAP_SHARED" in line and "MAP_ANONYMOUS" not in line:
            report["mappedWritableFiles"].append(line.split(") =", 1)[0].split(",", 5)[-1])
        if re.match(r"io_uring_(?:setup|enter|register)\(", line) and not re.search(r"\)\s+=\s+-1", line):
            report["incomplete"].append({"trace": str(path), "reason": "io_uring_requires_an_independent_write_observer"})
        if re.match(r"(?:sendfile|copy_file_range|splice)\(", line) and re.search(r"\)\s+=\s+[1-9]\d*", line):
            report["incomplete"].append({"trace": str(path), "reason": "zero_copy_write_requires_payload_observation"})
        if not re.match(r"(?:write|writev|pwrite64|pwritev|pwritev2)\(", line):
            continue
        returned = re.search(r"\)\s+=\s+(-?\d+)", line)
        if not returned:
            report["incomplete"].append({"trace": str(path), "reason": "unparsed_write_result"})
            continue
        size = int(returned[1])
        if size <= 0:
            continue
        report["writes"] += 1
        # Annotation before the first buffer distinguishes filesystem
        # sinks from pipes and authorized TLS transport sockets.
        fd = re.match(r"\w+\(\d+<(.+?)>,\s", line)
        if fd is None:
            report["incomplete"].append({"trace": str(path), "reason": "unresolved_write_fd"})
            continue
        # Positional writes need offset-aware reconstruction. Sequential
        # cross-thread calls are merged above; overlapping writes fail closed.
        sink = unhex(fd[1]).decode("utf-8", errors="replace") if "\\x" in fd[1] else fd[1]
        if sink.startswith("/") and line.startswith(("pwrite64(", "pwritev(", "pwritev2(")):
            report["incomplete"].append({"trace": str(path), "reason": "positional_write_requires_offset_reconstruction"})
        quoted = re.findall(r'"((?:\\x[0-9a-fA-F]{2})*)"', line)
        data = b"".join(unhex(value) for value in quoted)
        if len(data) < size:
            report["incomplete"].append({"trace": str(path), "sink": sink, "reason": "truncated_write_payload"})
            continue
        payload = data[:size]
        previous = tails.get(sink, b"")
        item = scanner.stream(io.BytesIO(previous + payload))
        # Suppress already counted matches wholly in the previous tail.
        old = scanner.stream(io.BytesIO(previous))["counts"]
        for name, count in old.items():
            item["counts"][name] -= count
            if not item["counts"][name]:
                del item["counts"][name]
        tails[sink] = (previous + payload)[-scanner.overlap:]
        item["bytes"] = size
        report["bytes"] += size
        if sink.startswith("/"):
            report["fileWrites"].append({"sink": sink, "bytes": size})
            if started < last_ends.get(sink, -1):
                report["incomplete"].append({"sink": sink, "reason": "overlapping_file_writes_require_offset_reconstruction"})
            last_ends[sink] = ended
        path_matches = scanner.stream(io.BytesIO(sink.encode())) if sink.startswith("/") else None
        if item["counts"] or path_matches and path_matches["counts"]:
            report["matches"].append({"sink": sink, **item, "pathMatches": path_matches})
    if not paths:
        report["incomplete"].append({"reason": "missing_write_observation"})
    report["complete"] = not report["incomplete"]
    return report


def selftest():
    import unittest
    class Controls(unittest.TestCase):
        def test_chunk_and_encodings(self):
            marker = "s4_scanner_" + "A" * 48
            scanner = Scanner({"control": marker})
            for encoding in ("utf-8", "utf-16le", "utf-16be"):
                data = b"." * (CHUNK - 7) + marker.encode(encoding)
                result = scanner.stream(io.BytesIO(data))
                self.assertEqual(result["counts"], {"control:" + encoding: 1})
        def test_short_read_is_not_zero(self):
            with self.assertRaises(OSError):
                Scanner({"control": "marker"}).stream(io.BytesIO(b""), 10)
        def test_missing_memory_and_files_are_incomplete(self):
            scanner = Scanner({"control": "marker"})
            self.assertFalse(scanner.memory(2147483647)["complete"])
            self.assertFalse(scanner.filesystem(["/s4_missing_scope"])["complete"])
            self.assertFalse(observed_writes([], scanner)["complete"])
        def test_partial_observation_is_incomplete(self):
            import tempfile
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory, "trace")
                path.write_text('write(2</sink>, "\\x61", 12) = 12\n')
                self.assertFalse(observed_writes([path], Scanner({"control": "marker"}))["complete"])
        def test_split_write_and_transport_annotation(self):
            import tempfile
            marker = "S4_" + "A" * 64
            encoded = lambda value: "".join("\\x%02x" % byte for byte in value.encode())
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory, "trace")
                path.write_text('write(3</deleted>, "' + encoded(marker[:20]) + '", 20) = 20\n' +
                                'write(3</deleted>, "' + encoded(marker[20:]) + '", 47) = 47\n' +
                                'write(4<TCP:[127.0.0.1:1->127.0.0.1:2]>, "' + encoded(marker) + '", 67) = 67\n')
                result = observed_writes([path], Scanner({"control": marker}))
                self.assertTrue(result["complete"])
                self.assertEqual(len(result["matches"]), 2)
                self.assertEqual(result["matches"][1]["sink"], "TCP:[127.0.0.1:1->127.0.0.1:2]")
        def test_cross_thread_ordering_and_overlap(self):
            import tempfile
            scanner = Scanner({"control": "marker"})
            with tempfile.TemporaryDirectory() as directory:
                first, second = Path(directory, "first"), Path(directory, "second")
                first.write_text('1.000000 write(3</deleted>, "\\x6d\\x61\\x72", 3) = 3 <0.001000>\n')
                second.write_text('1.002000 write(3</deleted>, "\\x6b\\x65\\x72", 3) = 3 <0.001000>\n')
                result = observed_writes([second, first], scanner)
                self.assertTrue(result["complete"])
                self.assertEqual(result["matches"][0]["counts"], {"control:utf-8": 1})
                second.write_text(second.read_text().replace("1.002000", "1.000500"))
                self.assertFalse(observed_writes([first, second], scanner)["complete"])
        def test_unsupported_write_backends_are_incomplete(self):
            import tempfile
            for line in ('io_uring_setup(8, {}) = 3', 'sendfile(2, 3, NULL, 10) = 10', 'pwrite64(3</deleted>, "\\x61", 1, 0) = 1'):
                with tempfile.TemporaryDirectory() as directory:
                    path = Path(directory, "trace")
                    path.write_text(line + "\n")
                    self.assertFalse(observed_writes([path], Scanner({"control": "marker"}))["complete"])
        def test_gzip_name_is_not_a_compression_claim(self):
            import tempfile
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory, "index.gz")
                path.write_bytes(b"marker")
                self.assertEqual(Scanner({"control": "marker"}).file(path)["counts"], {"control:utf-8": 1})
    result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(Controls))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(selftest())
