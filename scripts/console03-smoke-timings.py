"""Extract timing evidence from the retained diagnostic Playwright trace."""
import json
import pathlib
import zipfile
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'tmp/console03-smoke-120')
destination = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'docs/review/console-followups-3/smoke-120-actions.json')
with zipfile.ZipFile(next(root.rglob('trace.zip'))) as archive:
    events = [json.loads(line) for line in archive.read('test.trace').decode().splitlines()]
starts = {event['callId']: event for event in events if event['type'] == 'before'}
actions = []
for event in events:
    if event['type'] != 'after' or event['callId'] not in starts:
        continue
    start = starts[event['callId']]
    stack = start.get('stack', [])
    if stack and stack[0]['file'].endswith('/e2e/smoke.spec.ts') and stack[0]['line'] >= 61:
        actions.append(dict(line=stack[0]['line'], title=start['title'], start=start['startTime'],
                            end=event['endTime'], ms=event['endTime'] - start['startTime']))
actions.sort(key=lambda action: action['start'])
for low, high, name in [(61, 63, 'Sign-in and check email'), (64, 64, 'Callback and pool navigation'),
                        (65, 69, 'Edit and save row rule'), (70, 77, 'Read decision, MCP query and persisted receipt'),
                        (78, 81, 'Open receipt and validate'), (82, 82, 'Open recorded row decision')]:
    selected = [action for action in actions if low <= action['line'] <= high]
    if not selected:
        print(name, 'not exercised')
        continue
    start = min(action['start'] for action in selected)
    if low == 70:
        start = max(action['end'] for action in actions if action['line'] == 69)
    end = max(action['end'] for action in selected)
    print(name, round((end - start) / 1000, 3))
destination.write_text(json.dumps(actions, indent=2) + '\n')
