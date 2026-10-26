"""Layer-level runtime allowlist, independent of the final visible filesystem."""
import gzip
import hashlib
import io
import json
import pathlib
import re
import subprocess
import sys
import tarfile

POLICY = pathlib.Path(__file__).resolve().parents[2] / 'deploy/images/runtime-policy.json'
SOURCE_MAP = re.compile(rb'(?:[#@]\s*sourceMappingURL\s*=|"sourcesContent"\s*:)')


def normalized(name):
    path = pathlib.PurePosixPath(name)
    if '..' in path.parts:
        raise ValueError('Image path traverses its root')
    return str(path).removeprefix('/')


def forbidden(name):
    # POSIX test is a coreutils executable, not a test suite. It is still
    # forbidden in every application layer by the closed path allowlist.
    if name == 'usr/bin/test':
        return False
    path = pathlib.PurePosixPath(name)
    return path.suffix in {'.ts', '.tsx', '.map', '.pyc'} or any(
        part in {'.git', '.xq', '.aws', '.env', 'test', 'tests', 'fixtures', '__pycache__', 'node_modules'}
        or part.startswith('.env.') for part in path.parts)


class HashReader:
    def __init__(self, stream):
        self.stream = stream
        self.digest = hashlib.sha256()

    def read(self, size=-1):
        data = self.stream.read(size)
        self.digest.update(data)
        return data


class PrefixReader:
    def __init__(self, prefix, stream):
        self.prefix, self.stream = prefix, stream

    def read(self, size=-1):
        if size < 0:
            prefix, self.prefix = self.prefix, b''
            return prefix + self.stream.read()
        prefix, self.prefix = self.prefix[:size], self.prefix[size:]
        return prefix + self.stream.read(size - len(prefix))


class RuntimePolicy:
    def __init__(self, target, base_layers=()):
        policy = json.loads(POLICY.read_text())
        selected = policy['targets'][target]
        self.target = target
        self.files = set(policy['common'] + selected['files'] + (policy['native'] if selected['native'] else []))
        self.patterns = selected['patterns']
        self.base_layers = set(base_layers)
        self.observed = {}
        self.manifest = None
        self.layers = 0

    def allowed(self, name):
        return name in self.files or any(re.fullmatch(pattern, name) for pattern in self.patterns)

    def layer(self, source):
        stream = HashReader(source)
        violations = []
        observed = {}
        manifest = None
        with tarfile.open(fileobj=stream, mode='r|') as layer:
            for entry in layer:
                name = normalized(entry.name)
                # These are forbidden even inside a pinned OS base.
                if forbidden(name):
                    raise ValueError('Forbidden runtime path: ' + name)
                if name == 'work' or name.startswith('work/'):
                    required = 0o5 if entry.isdir() else 0o4
                    if entry.mode & required != required:
                        raise ValueError('Runtime user cannot read/traverse image content: ' + name)
                if entry.isdir():
                    continue
                if entry.issym() or entry.islnk():
                    if forbidden(entry.linkname):
                        raise ValueError('Forbidden runtime link: ' + name)
                    violations.append(name)
                    continue
                if not entry.isfile():
                    violations.append(name)
                    continue
                if not self.allowed(name):
                    violations.append(name)
                data = layer.extractfile(entry)
                digest = hashlib.sha256()
                tail = b''
                capture = bytearray()
                while True:
                    chunk = data.read(1024 * 1024)
                    if not chunk:
                        break
                    digest.update(chunk)
                    if name.endswith(('.js', '.mjs', '.cjs', '.json', '.html', '.css')) and SOURCE_MAP.search(tail + chunk):
                        raise ValueError('Source map embedded in runtime path: ' + name)
                    tail = chunk[-256:]
                    if name == 'work/runtime-manifest.json':
                        capture.extend(chunk)
                        if len(capture) > 1024 * 1024:
                            raise ValueError('Runtime manifest is oversized')
                if self.allowed(name):
                    observed[name] = digest.hexdigest()
                if capture:
                    manifest = json.loads(capture)
        # OCI diff_ids cover the entire uncompressed layer, including padding.
        while stream.read(1024 * 1024):
            pass
        identity = 'sha256:' + stream.digest.hexdigest()
        if identity not in self.base_layers:
            if violations:
                raise ValueError('Unapproved runtime-layer path: ' + violations[0])
            self.observed.update(observed)
            if manifest is not None:
                self.manifest = manifest
        self.layers += 1

    def finish(self):
        if not self.layers or not self.manifest:
            raise ValueError('Missing runtime layer/manifest coverage')
        manifest = self.manifest
        if manifest.get('target') != self.target or manifest.get('minified') is not True or manifest.get('sourceMaps') is not False:
            raise ValueError('Invalid runtime manifest identity')
        expected = {'work/' + name: digest for name, digest in manifest['artifacts'].items()}
        if any(not self.allowed(name) for name in expected):
            raise ValueError('Manifest declares an unapproved artifact')
        actual = {name: digest for name, digest in self.observed.items() if name != 'work/runtime-manifest.json'}
        if actual != expected or not self.files.issubset(self.observed):
            raise ValueError('Runtime artifact inventory or digest mismatch')


def scan(image, platform, target, base):
    info = json.loads(subprocess.check_output(['docker', 'image', 'inspect', '--platform', platform, base]))[0]
    policy = RuntimePolicy(target, info['RootFS']['Layers'])
    process = subprocess.Popen(['docker', 'image', 'save', '--platform', platform, image], stdout=subprocess.PIPE)
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|*') as archive:
            for entry in archive:
                if not entry.isfile():
                    continue
                if entry.name.endswith('/layer.tar') or entry.name.startswith('blobs/sha256/'):
                    source = archive.extractfile(entry)
                    prefix = source.read(512)
                    stream = PrefixReader(prefix, source)
                    if prefix[:2] == b'\x1f\x8b':
                        with gzip.GzipFile(fileobj=stream) as decoded:
                            policy.layer(decoded)
                    elif prefix[257:262] == b'ustar':
                        policy.layer(stream)
                    else:
                        content = prefix + source.read()
                        if not content.startswith(b'{'):
                            raise ValueError('Unknown runtime image blob; coverage incomplete')
                        json.loads(content)
        if process.wait() != 0:
            raise ValueError('Image export failed; coverage incomplete')
        policy.finish()
    finally:
        process.stdout.close()
        process.wait()
    # Exercise the visible filesystem as the image's actual configured user too.
    subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--read-only',
                    '--platform', platform, image, 'node', '-e',
                    "const f=require('node:fs');function walk(p){const s=f.statSync(p);f.accessSync(p,f.constants.R_OK|(s.isDirectory()?f.constants.X_OK:0));if(s.isDirectory())for(const n of f.readdirSync(p))walk(p+'/'+n)}walk('/work');walk('/etc/ssl/certs');f.accessSync('/usr/local/bin/node',f.constants.X_OK);"], check=True)
    print('Runtime allowlist and runtime-user readability verified: ' + image + ' ' + platform)


def layer_bytes(name, content, mode=0o644):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w') as archive:
        entry = tarfile.TarInfo(name)
        entry.size = len(content)
        entry.mode = mode
        archive.addfile(entry, io.BytesIO(content))
    return buffer.getvalue()


def self_test():
    cases = [('work/original.ts', b'export const source = true;'), ('work/a.js.map', b'{}'),
             ('work/fixtures/customer.json', b'{}'), ('work/extra.js', b'x'),
             ('work/egress.mjs', b'//# sourceMappingURL=data:application/json;base64,AAAA'),
             ('work/package.json', b'{"sourcesContent":["original source"]}')]
    for name, content in cases:
        policy = RuntimePolicy('egress')
        try:
            policy.layer(io.BytesIO(layer_bytes(name, content)))
            # A later whiteout cannot erase a violation in the earlier layer.
            policy.layer(io.BytesIO(layer_bytes('work/.wh.' + pathlib.PurePosixPath(name).name, b'')))
        except ValueError:
            continue
        raise AssertionError('Accepted forbidden/deleted payload: ' + name)
    for mode in [0o600, 0o000]:
        try:
            RuntimePolicy('console').layer(io.BytesIO(layer_bytes('work/dist/opintel-logo@2x.png', b'png', mode)))
        except ValueError:
            pass
        else:
            raise AssertionError('Unreadable umask-dependent asset accepted')
    policy = RuntimePolicy('egress')
    artifacts = {'egress.mjs': b'console.log(1);', 'package.json': b'{"type":"module"}'}
    manifest = {'target': 'egress', 'minified': True, 'sourceMaps': False,
                'artifacts': {name: hashlib.sha256(content).hexdigest() for name, content in artifacts.items()}}
    for name, content in artifacts.items():
        policy.layer(io.BytesIO(layer_bytes('work/' + name, content)))
    policy.layer(io.BytesIO(layer_bytes('work/runtime-manifest.json', json.dumps(manifest).encode())))
    policy.finish()
    policy.layer(io.BytesIO(layer_bytes('work/egress.mjs', b'changed artifact')))
    try:
        policy.finish()
    except ValueError:
        pass
    else:
        raise AssertionError('Changed artifact digest accepted')
    # Unknown OS files may be accepted only by the exact trusted base diff_id.
    raw = layer_bytes('usr/bin/test', b'pinned upstream coreutils executable')
    trusted = RuntimePolicy('egress', ['sha256:' + hashlib.sha256(raw).hexdigest()])
    trusted.layer(io.BytesIO(raw))
    try:
        RuntimePolicy('egress').layer(io.BytesIO(raw))
    except ValueError:
        pass
    else:
        raise AssertionError('Untrusted base file accepted')
    print('Runtime policy: forbidden, deleted-layer and trusted-base controls passed')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif len(sys.argv) == 5:
        scan(*sys.argv[1:])
    else:
        raise SystemExit('Supply image platform target trusted-base-image, or --self-test')
