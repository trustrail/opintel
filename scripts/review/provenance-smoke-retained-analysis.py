"""Read existing smoke evidence only; emit no payloads, headers, SQL or secrets."""
import json
import pathlib
import re
import zipfile
from datetime import datetime
from urllib.parse import urlsplit

ROOT = pathlib.Path('tmp/console-provenance-design-smoke-120')
DEST = pathlib.Path('docs/review/console-provenance-design/smoke-120-retained-analysis.json')
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')


def phases(path):
    text = pathlib.Path(path).read_text()
    starts = {}
    result = []
    for match in re.finditer(r"\{\s+event: 'engine.request_phase',(?P<body>.*?)\n\}", text, re.S):
        body = match.group('body')
        fields = {key: re.search(key + r": '([^']+)'", body) for key in ['timestamp', 'requestId', 'phase', 'state']}
        if not all(fields.values()):
            continue
        values = {key: value.group(1) for key, value in fields.items()}
        key = (values['requestId'], values['phase'])
        at = datetime.fromisoformat(values['timestamp'].replace('Z', '+00:00'))
        if values['state'] == 'start':
            starts[key] = at
        elif key in starts:
            result.append({'phase': values['phase'], 'startedAt': starts[key].isoformat(), 'endedAt': at.isoformat(), 'ms': (at - starts.pop(key)).total_seconds() * 1000})
    return result


def network(root):
    result = []
    with zipfile.ZipFile(next(root.rglob('trace.zip'))) as archive:
        for member in archive.namelist():
            if not member.endswith('.network'):
                continue
            for line in archive.read(member).decode().splitlines():
                event = json.loads(line)
                item = event.get('snapshot', {})
                request = item.get('request', {})
                response = item.get('response', {})
                result.append({'path': UUID.sub(':id', urlsplit(request.get('url', '')).path), 'method': request.get('method'), 'status': response.get('status'), 'resourceType': item.get('_resourceType'), 'startedAtMs': item.get('_monotonicTime'), 'ms': item.get('time'), 'timings': item.get('timings')})
    return result


def receipt_resources(rows):
    ordered = sorted(rows, key=lambda row: row['startedAtMs'] or 0)
    anchor = next(row['startedAtMs'] for row in ordered if row['path'] == '/projects/:id/runs/:id')
    roots = [row['startedAtMs'] for row in ordered if row['resourceType'] == 'document' and row['path'] == '/' and row['startedAtMs'] > anchor]
    end = roots[1] if len(roots) > 1 else float('inf')
    return [dict(row, relativeToReceiptNavigationMs=row['startedAtMs'] - anchor) for row in ordered if anchor <= row['startedAtMs'] < end]


report = {'current': {'enginePhases': phases('/private/tmp/provenance-smoke-120-diagnostic.log'), 'network': network(ROOT)}}
baseline = pathlib.Path('tmp/console03-smoke-120')
if baseline.exists() and next(baseline.rglob('trace.zip'), None):
    report['retainedBaseline'] = {'enginePhases': phases('/private/tmp/console03-smoke-120.log'), 'network': network(baseline)}
for data in report.values():
    data['receiptResources'] = receipt_resources(data['network'])
DEST.write_text(json.dumps(report, indent=2) + '\n')
for label, data in report.items():
    print(label, 'engine phase durations:', [(row['phase'], round(row['ms'], 1)) for row in data['enginePhases']])
    print(label, 'receipt navigation resources:', [(row['path'], row['status'], round(row['ms'], 1)) for row in data['receiptResources']])
