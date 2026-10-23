"""Scan every saved layer, including files removed by later layers. Never print values."""
import io
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tarfile

PRIVATE = re.compile(rb"-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{32,}-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----")
XQ_MATERIAL = re.compile(rb'"(?:XQ_API_KEY|DASHBOARD_API_KEY|senderAccessToken)"\s*:\s*"[^"\r\n]+"')
LIVE_KEY = re.compile(rb"\bopk_live_[A-Za-z0-9]{22}\b")

# Public known-answer vectors compiled into Debian's crypto library, verified
# byte-for-byte against GnuTLS 3.7.9 lib/crypto-selftests-pk.c. These are not
# operator credentials. Permit only these exact values in this library path.
GNUTLS_SELF_TESTS = {
    'd039c8119a029ab9f9c83c04d67002d887b6bc6026c4264402ab27cdf24cf138',
    '7c4c63ee462e0e700cd9e29c8e0f730b3f1b484c4abdd83f1e69fcd477c061fa',
    '91ea1699ff6b1a34b4a1d500a9c75a808441e47b9ea68da6fb0195e01ce1dc61',
    'ef237ea8db4f2ae9ee100e8ced96d29b5dceb0e6a948443e6b8a00b1791f9ec9',
    'fa0b06a72461ec0a963dcfccb8d5b61bd88a6074fc7271573bff68ab86b8c1af',
    'a4d138d7ef9748464117b44fb9c0a4b5b85a1599a127d02690abaa96d03c16e6',
}

def credential_content(data, name=''):
    library = re.fullmatch(r'(?:\./)?usr/lib/(?:x86_64|aarch64)-linux-gnu/libgnutls\.so\.30\.34\.3', name)
    return LIVE_KEY.search(data) or XQ_MATERIAL.search(data) or any(
        not library or hashlib.sha256(hit[0]).hexdigest() not in GNUTLS_SELF_TESTS
        for hit in PRIVATE.finditer(data)
    )

def forbidden_name(name):
    parts = pathlib.PurePosixPath(name).parts
    return any(p in {'.xq', '.aws', '.env'} or p.startswith('.env.') for p in parts) or pathlib.PurePosixPath(name).suffix.lower() in {'.key', '.p12', '.pfx', '.jks', '.keystore'} or pathlib.PurePosixPath(name).name in {'id_rsa', 'id_ed25519', 'id_ecdsa'}

def scan_layer(stream, seen=None):
    with tarfile.open(fileobj=stream, mode='r|*') as layer:
        for entry in layer:
            if forbidden_name(entry.name) or (entry.issym() or entry.islnk()) and forbidden_name(entry.linkname) or pathlib.PurePosixPath(entry.name).name == '.npmrc' and (not entry.isfile() or entry.size != 0):
                raise ValueError('Forbidden image path: '+entry.name)
            if entry.isfile():
                source = layer.extractfile(entry)
                tail = b''
                while True:
                    chunk = source.read(1024*1024)
                    if not chunk:
                        break
                    data = tail+chunk
                    if credential_content(data, entry.name):
                        raise ValueError('Credential material in image path: '+entry.name)
                    tail = data[-65536:]

def scan_image(image, platform, seen):
    child = subprocess.Popen(['docker', 'image', 'save', '--platform', platform, image], stdout=subprocess.PIPE)
    layers = 0
    try:
        with tarfile.open(fileobj=child.stdout, mode='r|*') as archive:
            for entry in archive:
                if not entry.isfile():
                    continue
                source = archive.extractfile(entry)
                # Containerd saves OCI blobs; the legacy exporter uses layer.tar.
                if entry.name.endswith('/layer.tar') or entry.name.startswith('blobs/sha256/'):
                    if entry.name in seen:
                        layers += seen[entry.name]
                        continue
                    prefix = source.read(512)
                    if prefix[257:262] == b'ustar' or prefix[:2] == b'\x1f\x8b':
                        scan_layer(PrefixedReader(prefix, source))
                        layers += 1
                        is_layer = 1
                    else:
                        is_layer = 0
                        content = prefix+source.read()
                        if credential_content(content):
                            raise ValueError('Credential material in image configuration')
                        if content.startswith(b'{'):
                            json.loads(content)
                        else:
                            raise ValueError('Unrecognized image blob; coverage incomplete')
                    seen[entry.name] = is_layer
        if child.wait() != 0:
            raise ValueError('Docker image export failed; coverage incomplete')
        if not layers:
            raise ValueError('No image layers scanned; coverage incomplete')
    except BaseException:
        child.stdout.close()
        child.wait()
        raise
    print('Image layers verified: '+image+' '+platform)

class PrefixedReader:
    def __init__(self, prefix, stream):
        self.prefix = prefix
        self.stream = stream
    def read(self, size=-1):
        if size < 0:
            data, self.prefix = self.prefix, b''
            return data+self.stream.read()
        data, self.prefix = self.prefix[:size], self.prefix[size:]
        return data+self.stream.read(size-len(data))

def self_test():
    cases = [('work/xq-config.json', json.dumps({'XQ_'+'API_KEY': 'synthetic-only'}).encode()), ('work/.env', b'x'), ('work/.xq/key.json', b'x'), ('work/private.key', b'x'), ('work/innocent.txt', b'-----BEGIN PRIVATE KEY-----\n'+b'A'*64+b'\n-----END PRIVATE KEY-----'), ('work/token', b'opk_live_'+b'A'*22)]
    for name, content in cases:
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w') as archive:
            entry = tarfile.TarInfo(name); entry.size = len(content)
            archive.addfile(entry, io.BytesIO(content))
        buffer.seek(0)
        try:
            scan_layer(buffer)
        except ValueError:
            continue
        raise AssertionError('Secret scanner accepted '+name)
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w') as archive:
        entry = tarfile.TarInfo('work/key-handler.js'); entry.size = 2
        archive.addfile(entry, io.BytesIO(b'{}'))
    buffer.seek(0); scan_layer(buffer)
    print('Image secret policy: positive and negative controls passed')

if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        args = sys.argv[1:]
        if not args or len(args) % 2:
            raise SystemExit('Supply image/platform pairs')
        checked = {}
        for at in range(0, len(args), 2):
            scan_image(args[at], args[at+1], checked)
