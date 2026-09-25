import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgresConnector, PostgresSourceScope, createPostgresConnector, type SidecarConnector, type SamplingAudit } from '../sidecar/index.js';
import { DevelopmentVaultAdapter, type VaultPort } from '../src/platform/vault/index.js';
import { CatalogObject, describeElement, mapSourceType } from '../src/modules/catalog/index.js';
import { ExposedName, ElementId, ObjectId, ProjectId, SourceId, ok, type Result } from '../src/shared/kernel/index.js';
import type { CatalogSnapshot } from '../src/modules/sources/index.js';

const suffix = randomUUID().replaceAll('-', '');
const schema = `connector.${suffix}`;
const hiddenSchema = `hidden_${suffix}`;
const role = `connector_${suffix}`;
const password = randomUUID();
const secret = 'ROW_VALUE_SENTINEL';
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const envelope = { requestId: 'connector-test', projectId: ProjectId(randomUUID()), sourceId: SourceId(randomUUID()), credentialRef: 'vault://test/customer' };
const element = ElementId(randomUUID());
let sourceUrl: string;
const events: SamplingAudit[] = [];
let connector: SidecarConnector;

// This provisions a simulated customer source, not Opintel metadata. Each
// fixture access owns and closes its connection, like the sidecar source scope.
async function fixture<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const request = (payload: unknown) => ({ ...envelope, payload });
const introspect = async (include = [schema]) => unwrap(await connector.introspect(request({ include }))).snapshot;
const sample = (consentGiven: boolean, object = 't0', column = 'label') => request({ consentGiven, elements: [{ elementId: element, schema, object, column }], limit: 2 });

beforeAll(async () => {
  await fixture(async (db) => {
    await db.query(`CREATE ROLE ${quote(role)} LOGIN PASSWORD '${password}'`);
    await db.query(`CREATE SCHEMA ${quote(schema)}; CREATE SCHEMA ${quote(hiddenSchema)}`);
    for (let i = 0; i < 200; i++) {
      await db.query(`CREATE TABLE ${quote(schema)}.t${i} (id integer PRIMARY KEY, label text)`);
    }
    await db.query(`ALTER TABLE ${quote(schema)}.t1 ADD CONSTRAINT parent_fk FOREIGN KEY (id) REFERENCES ${quote(schema)}.t0(id)`);
    await db.query(`COMMENT ON COLUMN ${quote(schema)}.t0.label IS 'Customer label'`);
    await db.query(`INSERT INTO ${quote(schema)}.t0 VALUES (1,$1),(2,$1),(3,'other'),(4,NULL)`, [secret]);
    await db.query(`ANALYZE ${quote(schema)}.t0`);
    await db.query(`CREATE VIEW ${quote(schema)}.labels AS SELECT label FROM ${quote(schema)}.t0`);
    await db.query(`CREATE TABLE ${quote(schema)}."sales.data" ("say"";--" text); INSERT INTO ${quote(schema)}."sales.data" VALUES ('quoted')`);
    await db.query(`CREATE TABLE ${quote(hiddenSchema)}.private (secret text)`);
    await db.query(`GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT SELECT ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(role)}`);
    await db.query(`CREATE TABLE ${quote(schema)}.partial (visible text, hidden text); GRANT SELECT (visible) ON ${quote(schema)}.partial TO ${quote(role)}`);
    const base = process.env.TEST_DATABASE_URL;
    if (base === undefined) throw new Error('Test database missing.');
    const url = new URL(base); url.username = role; url.password = password; sourceUrl = url.toString();
  });
  connector = createPostgresConnector({
    vault: new DevelopmentVaultAdapter({ OPINTEL_SECRET_TEST_CUSTOMER: sourceUrl }),
    limits: { maxConnectionsPerSource: 2, statementTimeoutMs: 2000, operationTimeoutMs: 5000 },
    audit: { record: async (event) => { events.push(event); } },
  });
}, 60000);
afterAll(async () => {
  await fixture(async (db) => {
    await db.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE; DROP SCHEMA IF EXISTS ${quote(hiddenSchema)} CASCADE`);
    await db.query(`DROP ROLE IF EXISTS ${quote(role)}`);
  });
});

describe('sidecar Postgres connector against a read-only source credential', () => {
  it('F-005/F-006: resolves source references through VaultPort on each call without returning or logging credentials', async () => {
    const environment: Record<string, string | undefined> = { OPINTEL_SECRET_TEST_CUSTOMER: sourceUrl };
    const vault = new DevelopmentVaultAdapter(environment);
    const resolve = vi.spyOn(vault, 'resolve');
    const store = vi.spyOn(vault, 'store');
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const source = createPostgresConnector({ vault,
      limits: { maxConnectionsPerSource: 1, statementTimeoutMs: 1000, operationTimeoutMs: 3000 },
      audit: { record: async (event) => { events.push(event); } },
    });
    try {
      expect(resolve).not.toHaveBeenCalled();
      const responses: unknown[] = [];
      responses.push(await source.testConnection(request({})));
      responses.push(await source.introspect(request({ include: [schema] })));
      responses.push(await source.sampleTopValues(sample(true)));
      responses.push(await source.estimateRowCount(request({ object: { schema, name: 't0' } })));
      expect(responses.every((response) => typeof response === 'object' && response !== null && 'ok' in response && response.ok === true)).toBe(true);
      delete environment.OPINTEL_SECRET_TEST_CUSTOMER;
      const missing = await source.testConnection(request({}));
      expect(missing).toMatchObject({ ok: false, error: { code: 'dependency_unavailable', message: 'Source credentials are unavailable.' } });
      responses.push(missing);
      // A successful previous call must not leave a cached resolved credential.
      environment.OPINTEL_SECRET_TEST_CUSTOMER = sourceUrl;
      expect(await source.testConnection(request({}))).toEqual(ok({ reachable: true }));
      expect(resolve.mock.calls).toEqual(Array.from({ length: 6 }, () => [envelope.credentialRef]));
      expect(store).not.toHaveBeenCalled();
      const literal = await source.testConnection({ ...request({}), credentialRef: sourceUrl });
      expect(literal).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
      expect(resolve).toHaveBeenCalledTimes(6);
      responses.push(literal);
      for (const output of [JSON.stringify(responses), JSON.stringify(events), JSON.stringify(logs.map((log) => log.mock.calls))]) {
        expect(output).not.toContain(password);
        expect(output).not.toContain(sourceUrl);
      }
    } finally {
      resolve.mockRestore(); store.mockRestore();
      for (const log of logs) log.mockRestore();
    }
  });

  it('F-005: an untrusted vault failure cannot expose a resolved credential in a connector response', async () => {
    const vault: VaultPort = {
      resolveBytes: async () => { throw new Error('Not used by this credential fixture.'); },
      resolve: async () => { throw new Error(`Vault failed with ${sourceUrl}`); },
      store: async () => { throw new Error('Not used.'); },
    };
    const source = createPostgresConnector({ vault,
      limits: { maxConnectionsPerSource: 1, statementTimeoutMs: 1000, operationTimeoutMs: 3000 },
      audit: { record: async () => {} },
    });
    const result = await source.testConnection(request({}));
    expect(result).toEqual(ok({ reachable: false, reason: 'Source operation failed.' }));
    expect(JSON.stringify(result)).not.toContain(password);
  });

  it('tests credentials and estimates without counting source rows', async () => {
    expect(await connector.testConnection(request({}))).toEqual(ok({ reachable: true }));
    expect(await connector.estimateRowCount(request({ object: { schema, name: 't0' } }))).toEqual(ok({ rows: 4 }));
    expect(await connector.estimateRowCount(request({ object: { schema, name: 't2' } }))).toEqual(ok({ rows: null }));
    expect(await connector.estimateRowCount(request({ object: { schema, name: 'labels' } }))).toEqual(ok({ rows: null }));
    expect(await connector.estimateRowCount(request({ object: { schema, name: 'absent' } }))).toMatchObject({ ok: false, error: { code: 'object_unavailable' } });
    const wrong = new URL(sourceUrl); wrong.password = 'invalid';
    const failing = new PostgresConnector(new PostgresSourceScope({ resolve: async () => wrong.toString() }, { maxConnectionsPerSource: 1, statementTimeoutMs: 1000, operationTimeoutMs: 3000 }), { record: async () => {} });
    expect(await failing.testConnection(request({}))).toEqual(ok({ reachable: false, reason: 'Source authentication failed.' }));
  });

  it('G-001/G-002/G-014: discovers 200 tables, views, keys and types inside 60s, without row values', async () => {
    const start = performance.now();
    const snapshot = await introspect();
    expect(performance.now() - start).toBeLessThan(60000);
    expect(snapshot.objects.filter((object) => /^t\d+$/.test(object.name))).toHaveLength(200);
    expect(snapshot.objects.find((object) => object.name === 't0')?.columns).toEqual([
      { sourceIdentifier: 'id', stableRef: '1', ordinal: 1, sourceType: 'integer', nullable: false, isKey: true, description: null },
      { sourceIdentifier: 'label', stableRef: '2', ordinal: 2, sourceType: 'text', nullable: true, isKey: false, description: 'Customer label' },
    ]);
    expect(snapshot.objects.find((object) => object.name === 'labels')?.kind).toBe('view');
    expect(snapshot.foreignKeys).toEqual([{ fromObject: `${quote(schema)}.t1`, fromColumn: 'id', toObject: `${quote(schema)}.t0`, toColumn: 'id' }]);
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(JSON.stringify(snapshot)).not.toContain(password);
    expect(snapshot.objects.find((object) => object.name === 'partial')?.columns.map((column) => column.sourceIdentifier)).toEqual(['visible']);
  });

  it('uses exact schema names; empty selects readable non-system schemas', async () => {
    expect((await introspect([schema + '%'])).objects).toEqual([]);
    expect((await introspect([hiddenSchema])).objects).toEqual([]);
    const snapshot = await introspect([]);
    expect(snapshot.objects.some((object) => object.schema === schema)).toBe(true);
    expect(snapshot.objects.some((object) => object.schema.startsWith('pg_') || object.schema === 'information_schema' || object.schema === hiddenSchema)).toBe(false);
  });

  it('G-003/G-004/G-005: repeated snapshots reconcile cleanly; additions allocate identity, removals retain it', async () => {
    const initial = await introspect();
    const catalog = unwrap(CatalogObject.create({ id: ObjectId(randomUUID()), projectId: envelope.projectId, sourceId: envelope.sourceId,
      schemaName: schema, objectName: 't2', kind: 'table', exposedSchema: ExposedName('source'), exposedName: ExposedName('t2'),
      lineageKnown: true, rowEstimate: null, description: null, status: 'active' }));
    const reconcile = (snapshot: CatalogSnapshot) => {
      const columns = snapshot.objects.find((object) => object.name === 't2')?.columns;
      if (columns === undefined) throw new Error('Missing fixture object.');
      return unwrap(catalog.reconcile(columns.map((column) => ({ ...column, exposedType: mapSourceType(column.sourceType) })),
        (column) => ok({ id: ElementId(randomUUID()), exposedName: ExposedName(column.sourceIdentifier) }), snapshot.takenAt));
    };
    expect(reconcile(initial).map((event) => event.type)).toEqual(['CatalogElementAdded', 'CatalogElementAdded']);
    expect(catalog.elements.every((element) => describeElement(element.state, null).status === 'undecided')).toBe(true);
    expect(reconcile(await introspect())).toEqual([]);
    await fixture((db) => db.query(`ALTER TABLE ${quote(schema)}.t2 ADD COLUMN added text`));
    expect(reconcile(await introspect()).map((event) => event.type)).toEqual(['CatalogElementAdded']);
    const added = catalog.elements.find((entry) => entry.state.sourceIdentifier === 'added')?.state;
    expect(added).toBeDefined();
    if (added !== undefined) expect(describeElement(added, null).status).toBe('undecided');
    await fixture((db) => db.query(`ALTER TABLE ${quote(schema)}.t2 DROP COLUMN added`));
    expect(reconcile(await introspect()).map((event) => event.type)).toEqual(['CatalogElementRemoved']);
    expect(catalog.elements.find((entry) => entry.state.id === added?.id)?.state).toMatchObject({ status: 'removed', exposedName: added?.exposedName });
    expect(reconcile(await introspect())).toEqual([]);
  });

  it('G-015: missing or false consent refuses before resolving credentials and records the refusal', async () => {
    let contacts = 0;
    const refused = new PostgresConnector(new PostgresSourceScope({ resolve: async () => { contacts++; return sourceUrl; } }, { maxConnectionsPerSource: 1, statementTimeoutMs: 1000, operationTimeoutMs: 2000 }), { record: async (event) => { events.push(event); } });
    expect(await refused.sampleTopValues(sample(false))).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(await refused.sampleTopValues(request({ elements: [], limit: 1 }))).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(contacts).toBe(0);
    expect(events.at(-1)).toMatchObject({ consentGiven: false, outcome: 'refused' });
  });

  it('G-016: consent returns top frequencies with an identifier-only audit trail', async () => {
    const result = await connector.sampleTopValues(sample(true));
    expect(result).toEqual(ok({ values: { [element]: [{ value: secret, frequency: 2 }, { value: 'other', frequency: 1 }] } }));
    expect(events.slice(-2).map((event) => event.outcome)).toEqual(['started', 'completed']);
    expect(events.at(-1)).toMatchObject({ sourceId: envelope.sourceId, elementIds: [element], consentGiven: true });
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(password);
    expect(await connector.sampleTopValues(sample(true, 'sales.data', 'say";--'))).toEqual(ok({ values: { [element]: [{ value: 'quoted', frequency: 1 }] } }));
    expect(await connector.sampleTopValues(sample(true, 't0; DROP TABLE t0;--'))).toMatchObject({ ok: false });
    expect(await connector.testConnection(request({}))).toEqual(ok({ reachable: true }));
  });

  it('refuses sampling when its audit sink cannot record the call', async () => {
    let contacts = 0;
    const unavailable = new PostgresConnector(new PostgresSourceScope({ resolve: async () => { contacts++; return sourceUrl; } }, { maxConnectionsPerSource: 1, statementTimeoutMs: 1000, operationTimeoutMs: 2000 }), { record: async () => { throw new Error('sink unavailable'); } });
    expect(await unavailable.sampleTopValues(sample(true))).toMatchObject({ ok: false, error: { code: 'dependency_unavailable' } });
    expect(contacts).toBe(0);
  });

  it('C.4: scope enforces read-only, statement timeout and closes every connection', async () => {
    const scope = new PostgresSourceScope({ resolve: async () => sourceUrl }, { maxConnectionsPerSource: 1, statementTimeoutMs: 50, operationTimeoutMs: 1000 });
    const { VaultRef } = await import('../src/platform/vault/types.js');
    const ref = VaultRef(envelope.credentialRef);
    expect(await scope.run('test', ref, (session) => session.query('SHOW transaction_read_only'))).toEqual([{ transaction_read_only: 'on' }]);
    await expect(scope.run('test', ref, (session) => session.query('SELECT pg_sleep(1)'))).rejects.toMatchObject({ code: '57014' });
    await expect(scope.run('test', ref, (session) => session.query(`INSERT INTO ${quote(schema)}.t0 VALUES (9,'write')`))).rejects.toMatchObject({ code: '25006' });
    expect(await fixture(async (db) => (await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1", [role])).rows)).toEqual([{ count: 0 }]);
  });

  it('G-018: request abort cancels the source backend and releases its connection', async () => {
    const { VaultRef } = await import('../src/platform/vault/types.js');
    const scope = new PostgresSourceScope({ resolve: async () => sourceUrl }, { maxConnectionsPerSource: 1, statementTimeoutMs: 5000, operationTimeoutMs: 6000 });
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    let code: unknown;
    const running = scope.run('cancel-test', VaultRef(envelope.credentialRef), async (session) => {
      started();
      try { await session.query('SELECT pg_sleep(5)'); }
      catch (error: unknown) { if (typeof error === 'object' && error !== null && 'code' in error) code = error.code; throw error; }
    }, controller.signal);
    const finished = expect(running).rejects.toThrow();
    await ready;
    const start = performance.now();
    controller.abort();
    await finished;
    expect(performance.now() - start).toBeLessThan(2500);
    expect(code).toBe('57014');
    expect(await fixture(async (db) => (await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1", [role])).rows)).toEqual([{ count: 0 }]);
  });

  it('C.4: bounds total wall time, refuses excess connections, and releases the slot', async () => {
    const { VaultRef } = await import('../src/platform/vault/types.js');
    const scope = new PostgresSourceScope({ resolve: async () => sourceUrl }, { maxConnectionsPerSource: 1, statementTimeoutMs: 5000, operationTimeoutMs: 100 });
    const ref = VaultRef(envelope.credentialRef);
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const running = scope.run('test', ref, async (session) => { started(); return session.query('SELECT pg_sleep(5)'); });
    const finished = expect(running).rejects.toThrow();
    await ready;
    await expect(scope.run('test', ref, async () => {})).rejects.toThrow();
    await finished;
    expect(await scope.run('test', ref, (session) => session.query('SELECT 1 AS ok'))).toEqual([{ ok: 1 }]);
  });
});
