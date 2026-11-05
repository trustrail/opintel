"""Project retained Node transport logs onto non-secret diagnostic fields."""
from pathlib import Path
import json
import re
import sys

root = Path(sys.argv[1])
source = next(root.glob('verify-gateway-api-*.log'))
lines = [re.sub(r'^\S+Z\s?', '', line) for line in source.read_text().splitlines()]
records = []
current = []
depth = 0
for line in lines:
    if not current and line.strip() == '{':
        current = [line]
        depth = 1
        continue
    if current:
        current.append(line)
        depth += line.count('{') - line.count('}')
        if depth == 0:
            block = '\n'.join(current)
            current = []
            if any(event in block for event in ['engine.transport_', 'engine.probe_refused', 'engine.verification_refused']):
                record = {}
                for key in ['event', 'timestamp', 'callId', 'path', 'attempt', 'phase', 'reason', 'written', 'dnsSkipped', 'nativeErrorCode', 'errorCode', 'stage', 'status', 'dns', 'tcp', 'tls', 'connect', 'total']:
                    match = re.search(r'(?m)^\s*' + key + r':\s*([^\n]+)', block)
                    if match:
                        record[key] = match.group(1).rstrip(',')
                records.append(record)
Path(sys.argv[2]).write_text(json.dumps(records, indent=2) + '\n')
