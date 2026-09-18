import { execFileSync } from 'node:child_process';
import { randomUUID, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SidecarSourceConnector, type SourceConnectorContext, type SidecarOptions } from '../src/modules/sources/index.js';
import { ElementId, ObjectId, ProjectId, SourceId, ok } from '../src/shared/kernel/index.js';
import { VaultRef } from '../src/platform/vault/types.js';

const ref = VaultRef('vault://customer/warehouse');
const element = ElementId(randomUUID());
const context: SourceConnectorContext = {
  projectId: ProjectId(randomUUID()), sourceId: SourceId(randomUUID()), requestId: 'request-123',
  sampling: async () => ok({ consentGiven: true, elements: [{ elementId: element, schema: 'public', object: 'orders', column: 'customer' }] }),
};
const object = { id: ObjectId(randomUUID()), sourceId: context.sourceId, schema: 'public', name: 'orders' };
let dir: string;
let tls: SidecarOptions['tls'];
let server: Server;
let url: string;
let seen: Array<{ path: string; method: string; body: unknown }>;
let responses: Record<string, unknown>;
let stall: string | undefined;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'opintel-sidecar-'));
  const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-subj', '/CN=Test CA', '-days', '2');
  for (const name of ['server', 'client']) {
    openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${name}`);
    writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:localhost\nextendedKeyUsage=${name === 'server' ? 'serverAuth' : 'clientAuth'}\n`);
    openssl('x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.pem`, '-days', '2', '-extfile', `${name}.ext`);
  }
  const read = (name: string) => readFileSync(join(dir, name), 'utf8');
  tls = { ca: read('ca.pem'), cert: read('client.pem'), key: read('client.key'), pinnedCertificate: read('server.pem') };
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(async () => {
  seen = [];
  stall = undefined;
  responses = { '/health': { version: '1.0.0', contract: 1, duckdb: '1.4.3' }, '/test-connection': { reachable: true }, '/estimate': { rows: null } };
  server = createServer({ ca: tls.ca, cert: tls.pinnedCertificate, key: readFileSync(join(dir, 'server.key')), requestCert: true, rejectUnauthorized: true }, (req, res) => {
    if ((req.socket as TLSSocket).getPeerCertificate().fingerprint256 !== new X509Certificate(tls.cert).fingerprint256) { req.socket.destroy(); return; }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const path = req.url ?? '';
      seen.push({ path, method: req.method ?? '', body: text === '' ? undefined : JSON.parse(text) as unknown });
      if (path === stall) return;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(responses[path] ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing server port.');
  url = `https://localhost:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const client = (options: Partial<SidecarOptions> = {}, ctx = context) => new SidecarSourceConnector('postgres', ctx, { baseUrl: url, tls, ...options });

describe('SourceConnector sidecar wire contract', () => {
  it('uses pinned mutual TLS and checks contract once before source contact; only sends a vault reference', async () => {
    const connector = client();
    expect(await connector.testConnection(ref)).toEqual(ok(undefined));
    expect(await connector.testConnection(ref)).toEqual(ok(undefined));
    expect(seen.map(({ path }) => path)).toEqual(['/health', '/test-connection', '/test-connection']);
    expect(seen[0]).toEqual({ path: '/health', method: 'POST', body: undefined });
    expect(seen[1]).toEqual({ path: '/test-connection', method: 'POST', body: { requestId: context.requestId, projectId: context.projectId, sourceId: context.sourceId, credentialRef: ref, payload: {} } });
  });
  it.each([0, 2])('refuses contract %s without contacting the source', async (contract) => {
    responses['/health'] = { version: '1.0.0', contract, duckdb: '1.4.3' };
    expect(await client().testConnection(ref)).toMatchObject({ ok: false, error: { code: 'dependency_unavailable', message: expect.stringContaining('contract 1') } });
    expect(seen.map(({ path }) => path)).toEqual(['/health']);
  });
  it('rejects an unpinned server even when its CA is trusted', async () => {
    expect(await client({ tls: { ...tls, pinnedCertificate: tls.cert } }).testConnection(ref)).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
  });
  it('requires a client certificate', async () => {
    expect(await client({ tls: { ...tls, cert: '', key: '' } }).testConnection(ref)).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
  });
  it('F-002/F-005: authentication failure names the failure without reflecting credentials', async () => {
    responses['/test-connection'] = { reachable: false, reason: 'password authentication failed: postgres://user:secret@host/db' };
    const result = await client().testConnection(ref);
    expect(result).toMatchObject({ ok: false, error: { message: 'Source authentication failed.' } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it.each(['/health', '/test-connection'])('F-003: bounds %s stalls inside 10 seconds', async (path) => {
    stall = path;
    const start = performance.now();
    expect(await client({ timeoutMs: 100 }).testConnection(ref)).toMatchObject({ ok: false, error: { message: 'Source connection timed out.' } });
    expect(performance.now() - start).toBeLessThan(1000);
  });
  it('preserves a successful unknown estimate separately from failure', async () => {
    expect(await client().estimateRowCount(ref, object)).toEqual(ok(null));
    responses['/estimate'] = { rows: 123 };
    expect(await client().estimateRowCount(ref, object)).toEqual(ok(123));
    expect(seen.at(-1)?.body).toMatchObject({ payload: { object: { schema: 'public', name: 'orders' } } });
  });
  it('does not contact the sidecar without consent or for another source', async () => {
    const connector = client({}, { ...context, sampling: async () => ok({ consentGiven: false, elements: [] }) });
    expect(await connector.sampleTopValues(ref, [element], 5)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(await connector.estimateRowCount(ref, { ...object, sourceId: SourceId(randomUUID()) })).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
  });
  it('asserts consent and maps only requested sample values', async () => {
    responses['/sample'] = { values: { [element]: [{ value: 'example', frequency: 2 }] } };
    expect(await client().sampleTopValues(ref, [element], 5)).toEqual(ok(new Map([[element, [{ value: 'example', frequency: 2 }]]])));
    expect(seen.at(-1)?.body).toMatchObject({ payload: { consentGiven: true, limit: 5, elements: [{ elementId: element, schema: 'public', object: 'orders', column: 'customer' }] } });
    responses['/sample'] = { values: { [randomUUID()]: [] } };
    expect(await client().sampleTopValues(ref, [element], 5)).toMatchObject({ ok: false });
  });
  it('returns structure from introspection and rejects undeclared fields (F-005)', async () => {
    const snapshot = { takenAt: '2026-09-18T00:00:00.000Z', objects: [{ schema: 'public', name: 'orders', kind: 'table', rowEstimate: null, columns: [{ sourceIdentifier: 'customer', stableRef: '1', ordinal: 1, sourceType: 'text', nullable: true, isKey: false, description: null }] }], foreignKeys: [] };
    responses['/introspect'] = { snapshot };
    expect(await client().introspect(ref, ['public'])).toEqual(ok(snapshot));
    responses['/introspect'] = { snapshot, password: 'secret' };
    const result = await client().introspect(ref, ['public']);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('rejects a literal credential before any network request (F-006)', async () => {
    expect(await client().testConnection('postgres://user:secret@host/db' as VaultRef)).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
  });
});
