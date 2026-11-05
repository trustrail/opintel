"""Check macOS metadata exclusion, Linux extraction, and archive SHA-256s."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tarfile

root = Path(sys.argv[1]).resolve()
upstream = json.loads(Path('deploy/images/upstream.json').read_text())
image = upstream['x-build-images']['nodeRuntime']
probe = subprocess.run(['docker', 'image', 'inspect', image], capture_output=True)
if probe.returncode:
    subprocess.run(['docker', 'pull', '--platform', 'linux/amd64', image], check=True, capture_output=True)
results = []
for archive in sorted(root.glob('*.tar.gz')):
    bad = []
    members = 0
    with tarfile.open(archive, 'r:gz') as stream:
        for entry in stream:
            members += 1
            if Path(entry.name).name.startswith('._') or any(key.startswith(('LIBARCHIVE.xattr.', 'SCHILY.xattr.')) for key in entry.pax_headers):
                bad.append(entry.name)
    if bad:
        raise SystemExit('macOS metadata found in ' + archive.name)
    command = ['docker', 'run', '--rm', '--network', 'none', '--platform', 'linux/amd64', '--mount', f'type=bind,src={root},dst=/archives,readonly', '--entrypoint', '/bin/sh', image, '-c', 'mkdir /tmp/extracted && tar -xzf "$1" -C /tmp/extracted', 'archive-check', '/archives/' + archive.name]
    result = subprocess.run(command, capture_output=True, text=True, timeout=600)
    (root / (archive.name + '.linux-extraction.log')).write_text(result.stdout + result.stderr)
    if result.returncode or result.stderr.strip():
        raise SystemExit('Linux extraction failed or warned for ' + archive.name + '; inspect retained extraction log')
    with archive.open('rb') as content:
        digest = hashlib.file_digest(content, 'sha256').hexdigest()
    results.append({'archive': archive.name, 'bytes': archive.stat().st_size, 'sha256': digest, 'members': members, 'macMetadataEntries': 0, 'linuxExtraction': 'passed', 'linuxWarnings': 0})
if len(results) != 4:
    raise SystemExit('Expected exactly four archives')
(root / 'archive-checks.json').write_text(json.dumps(results, indent=2) + '\n')
(root / 'SHA256SUMS').write_text(''.join(row['sha256'] + '  ' + row['archive'] + '\n' for row in results))
print(json.dumps(results, indent=2))
