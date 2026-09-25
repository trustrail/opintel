import { createPostgresConnector } from '../sidecar/create-postgres-connector.js';
import { IntrospectionJob, PostgresIntrospectionStore, type SourceConnector } from '../src/modules/sources/index.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarClientOptions } from '../src/modules/sources/index.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { FilingRegister, type LandingZone } from '../sidecar/ingest/register.js';
import { FilingLander } from '../sidecar/ingest/land.js';
import { SpreadsheetExtractor } from '../sidecar/ingest/extract.js';
import { LocalWorkbookReader } from '../sidecar/ingest/infrastructure/workbook-reader.js';
import { HttpsLandingReceipts } from '../sidecar/ingest/infrastructure/receipt-client.js';
import { PostgresLanding } from '../sidecar/ingest/infrastructure/postgres-landing.js';
import { ingestAttributes, ingestEvent, ingestErrorCategory } from '../sidecar/ingest/telemetry.js';
import { createLandingReceiptServer } from '../src/modules/ingest/api/landing-receipt-server.js';
import { registerRoutes } from '../src/modules/ingest/api/register-routes.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { AcceptLandingReceipt } from '../src/modules/ingest/application/landing-receipts.js';
import { PostgresLandingReceiptRepository } from '../src/modules/ingest/infrastructure/landing-receipts.js';
import { PostgresFilingRegister } from '../src/modules/ingest/infrastructure/register.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { ProjectId, SourceId, UserId, FilingId, SystemClock, UuidV7IdFactory, DomainError, err, ok, type Result } from '../src/shared/kernel/index.js';
import { SecretRef, EnvironmentSecretStore } from '../src/platform/secrets/index.js';
import { arrivalNoticeSchema, reconciliationReportSchema, filingListResponseSchema, type LandingReceipt } from '../src/shared/landing-contract.js';
import type { FilingParty, FilingPartyRule, PartyId, FilingPartyRuleId } from '../src/modules/ingest/index.js';
import type { AuthorizationPort } from '../src/modules/authz/index.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';

const unwrap = <T>(value: Result<T>): T => { if (!value.ok) throw value.error; return value.value; };
const context = { projectId: ProjectId(randomUUID()), userId: UserId(randomUUID()) };
let directory: string;
let server: ReturnType<typeof createLandingReceiptServer>;
let browser: ReturnType<typeof createHttpServer> | undefined;
let delivery: HttpsLandingReceipts;
let register: FilingRegister | undefined;
let zone: LandingZone;
let party: FilingParty;
let rule: FilingPartyRule;
let egress: Array<{ path: string; body: unknown }>;
const repository = new PostgresFilingRegister();
const sources: SourceId[] = [];
const secret = 'CELL_SENTINEL_customer_value_918273';
async function snapshot(rules = [rule]) { await writeFile(zone.rulesFile, JSON.stringify({ filingParties: [party], rules })); }
async function scans() { await register!.scan(); await register!.scan(); }
async function arrive(name: string, value: string) { await writeFile(join(zone.directory, name), value); await scans(); }
async function openRegister() {
 const writer = new PostgresLanding({ resolve: async () => process.env.TEST_DATABASE_URL! });
 const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
 const lander = new FilingLander(zone.directory, { ...zone.landing!, projectId: zone.projectId, sourceId: zone.sourceId }, writer, extractor, delivery);
 register = await FilingRegister.open(zone, undefined, extractor, lander, delivery);
}

describe('filing register', () => {
 resetDatabaseBeforeEach('company');
 beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'filing-register-'));
  await prepareSidecarDevelopment(directory);
  const options = await loadSidecarClientOptions(join(directory, 'client.json'));
  server = createLandingReceiptServer(options.tls, new AcceptLandingReceipt(new PostgresLandingReceiptRepository()), repository);
  // Inspect actual sidecar HTTP egress, before the application schema parses it.
  server.prependListener('request', (request) => {
   const chunks: Buffer[] = [];
   request.on('data', (chunk: Buffer) => chunks.push(chunk));
   request.on('end', () => egress.push({ path: request.url!, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
  const { tls } = await loadSidecarConfig(join(directory, 'service.json'));
  delivery = new HttpsLandingReceipts(`https://127.0.0.1:${address.port}`, { ca: tls.ca, cert: tls.cert, key: tls.key, pinnedCertificate: tls.clientPin });
 });
 beforeEach(async () => {
  egress = [];
  const sourceId = SourceId(randomUUID()); sources.push(sourceId);
  const root = join(directory, sourceId); await mkdir(root); await mkdir(join(root, 'zone'));
  zone = { projectId: context.projectId, sourceId, directory: join(root, 'zone'), stateFile: join(root, 'state.json'), rulesFile: join(root, 'rules.json'), pollMs: 1000,
   landing: { name: `register_${sourceId.replaceAll('-', '')}`, credentialRef: SecretRef('secret://customer/register'), strategy: 'append_as_at' } };
  party = { id: randomUUID() as PartyId, projectId: context.projectId, code: 'supplier', name: 'Supplier', active: true, decimalSeparator: '.', dateFormat: 'YYYY-MM-DD' };
  rule = { id: randomUUID() as FilingPartyRuleId, projectId: context.projectId, partyId: party.id, active: true, matchKind: 'filename_regex',
   pattern: '^supplier_(?<period>2026-03)(?:_v[0-9]+)?\\.csv$', kind: 'inventory', periodGroup: 'period', priority: 1, sheetIndex: 1, headerRow: 1, periodAsAtFormat: 'month_end' };
  await snapshot();
  await withPlatform(async (tx) => {
   const [industry] = await tx.query<{ id: string }>('SELECT id FROM industry LIMIT 1');
   const [company] = await tx.query<{ id: string }>("INSERT INTO company (name,default_region) VALUES ('Register','eu-west-1') RETURNING id");
   await tx.query("INSERT INTO project (id,company_id,industry_id,name,region) VALUES ($1,$2,$3,'Register','eu-west-1')", [context.projectId,company!.id,industry!.id]);
  });
  await withTenant(context, (tx) => tx.query("INSERT INTO data_source (id,project_id,kind,name,exposed_alias,credential_ref,receives_landings) VALUES ($1,$2,'postgres','Register','register','secret://customer/register',true)", [sourceId,context.projectId]));
  await openRegister();
 });
 afterEach(async () => { await register?.close(); register = undefined; if (browser) await new Promise<void>((resolve) => browser!.close(() => resolve())); browser = undefined; vi.restoreAllMocks(); });
 afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Customer-database cleanup, not an application metadata access path.
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
  try {
   for (const sourceId of sources) {
    const rows = await db.query<{ schema_name: string }>('SELECT schema_name FROM _opintel_landing.sources WHERE source_id=$1', [sourceId]);
    for (const row of rows.rows) await db.query(`DROP SCHEMA "${row.schema_name.replaceAll('"', '""')}" CASCADE`);
    for (const table of ['commits', 'groups', 'sources']) await db.query(`DELETE FROM _opintel_landing.${table} WHERE source_id=$1`, [sourceId]);
   }
  } finally { await db.end(); await rm(directory, { recursive: true, force: true }); }
 });
 it('ING-27/28: preserves arrival authority and lineage across restart; accounts for landed, duplicate, quarantined and unregistered files', async () => {
  await arrive('supplier_2026-03.csv', 'quantity\n100\n');
  await arrive('supplier_2026-03_v2.csv', 'quantity\n125\n');
  await arrive('supplier_2026-03_v3.csv', 'quantity\n100\n');
  await arrive('unknown.csv', secret);
  const records = register!.records();
  expect(records).toHaveLength(4);
  const first = records[0]!; const second = records[1]!;
  expect(second).toMatchObject({ supersedes: first.id, strategy: 'append_as_at', landing: { registered: true, receipt: { rowCount: 1 } } });
  expect(records[2]).toMatchObject({ status: 'duplicate', duplicateOf: first.id });
  expect(records[3]).toMatchObject({ status: 'quarantined', reason: 'No filing party rule matched.' });
  expect(await register!.reconcile()).toMatchObject({ zoneFileCount: 4, registeredCount: 4, unregisteredCount: 0 });
  await writeFile(join(zone.directory, 'in-flight.csv'), secret);
  expect(await register!.reconcile()).toMatchObject({ zoneFileCount: 5, registeredCount: 4, unregisteredCount: 1 });
  expect(await withTenant(context, (tx) => tx.query<{ payload: unknown }>('SELECT payload FROM reconciliation_report'))).toEqual([{ payload: expect.objectContaining({ zoneFileCount: 5, unregisteredCount: 1 }) }]);
  await register!.close(); register = undefined; await openRegister();
  expect(register!.records()).toEqual(records);
  const listed = unwrap(await repository.list(context.projectId,context.userId,null,100));
  expect(listed).toHaveLength(4);
  expect(listed.find((row) => row.filingId === second.id)).toMatchObject({ supersedes: first.id, rowCount: 1, outcome: 'landed', partyCode: party.code, receivedAt: second.receivedAt });
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
  try { expect((await db.query(`SELECT quantity, _opintel_filing_id FROM ${first.landing!.receipt.landedTable} ORDER BY quantity`)).rows).toEqual([{ quantity: '100', _opintel_filing_id: first.id }, { quantity: '125', _opintel_filing_id: second.id }]); } finally { await db.end(); }
 });
 it('ING-29: local retry preserves identity, revalidates rules and rejects changing bytes or manual attribution', async () => {
  await snapshot([]); await arrive('supplier_2026-03.csv', 'quantity\n100\n');
  const original = register!.records()[0]!;
  expect(original.status).toBe('quarantined');
  const oldNotice = egress.find((item) => item.path === '/arrival-notice')!.body;
  await register!.retry(original.id);
  expect(register!.records()[0]?.status).toBe('quarantined');
  await snapshot(); await register!.retry(original.id);
  const retried = register!.records()[0]!;
  expect(retried).toMatchObject({ id: original.id, sha256: original.sha256, receivedAt: original.receivedAt, landing: { registered: true } });
  expect(retried.revision).toBeGreaterThan(original.revision!);
  // Delayed old notice cannot overwrite successful resolution.
  unwrap(await delivery.notice(arrivalNoticeSchema.parse(oldNotice)));
  expect(unwrap(await repository.list(context.projectId,context.userId,null,100))[0]).toMatchObject({ outcome: 'landed', revision: retried.revision });
  await arrive('unmatched.csv', 'before'); const quarantined = register!.records().at(-1)!;
  await writeFile(join(zone.directory, 'unmatched.csv'), 'after');
  await expect(register!.retry(quarantined.id)).rejects.toThrow('file has changed');
  expect(register!.records().at(-1)).toEqual(quarantined);
 });
 it('schedules recovery independently of scans, backs off to five minutes, resets and stops', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const scans = vi.spyOn(register!, 'scan').mockResolvedValue(undefined);
  const recover = vi.spyOn(PostgresLanding.prototype, 'committed');
  const failure = err(new DomainError('dependency_unavailable', 'Unavailable'));
  const send = vi.spyOn(delivery, 'reconcile').mockResolvedValue(failure);
  const original = register!.reconcile.bind(register!);
  let work: ReturnType<FilingRegister['reconcile']> | undefined;
  const reconcile = vi.spyOn(register!, 'reconcile').mockImplementation(() => { work = original(); return work; });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
   register!.start();
   const advance = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await work; await vi.advanceTimersByTimeAsync(0); };
   await advance(0); expect(send).toHaveBeenCalledTimes(1);
   for (const [index, delay] of [30_000,60_000,120_000,240_000,300_000,300_000].entries()) {
    await advance(delay - 1); expect(send).toHaveBeenCalledTimes(index + 1);
    await advance(1); expect(send).toHaveBeenCalledTimes(index + 2);
   }
   expect(recover).toHaveBeenCalledTimes(7); expect(scans.mock.calls.length).toBeGreaterThan(100);
   send.mockResolvedValue(ok(undefined));
   await advance(300_000); expect(send).toHaveBeenCalledTimes(8);
   await advance(29_999); expect(send).toHaveBeenCalledTimes(8);
   await advance(1); expect(send).toHaveBeenCalledTimes(9);
   await register!.close(); register = undefined;
   await advance(600_000); expect(reconcile).toHaveBeenCalledTimes(9);
  } finally { vi.useRealTimers(); }
 });
 it('ordinary scans do not read committed history or retry failed notice delivery', async () => {
  const recover = vi.spyOn(PostgresLanding.prototype, 'committed');
  const notice = vi.spyOn(delivery, 'notice').mockResolvedValue(err(new DomainError('dependency_unavailable', 'Unavailable')));
  await arrive('unmatched.csv', 'private');
  expect(notice).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 5; i += 1) await register!.scan();
  expect(recover).not.toHaveBeenCalled(); expect(notice).toHaveBeenCalledTimes(1);
  await register!.reconcile(); expect(recover).toHaveBeenCalledTimes(1); expect(notice).toHaveBeenCalledTimes(2);
 });
 it.each(['not_found', 'forbidden', 'validation_failed', 'conflict', 'dependency_unavailable'] as const)('preserves receipt refusal category %s over mTLS', async (code) => {
  vi.spyOn(repository, 'reconcile').mockResolvedValueOnce(err(new DomainError(code, 'Registration refused.')));
  expect(await delivery.reconcile({ sourceId: zone.sourceId, checkedAt: new Date().toISOString(), zoneFileCount: 0, registeredCount: 0, unregisteredCount: 0 }, zone.projectId)).toMatchObject({ ok: false, error: { code } });
 });
 it('logs reconciliation identity, safe category and attempts, resetting after success', async () => {
  const logs = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const failure = err(new DomainError('dependency_unavailable', secret));
  const send = vi.spyOn(delivery, 'reconcile').mockResolvedValueOnce(failure).mockResolvedValueOnce(failure).mockResolvedValueOnce(ok(undefined)).mockResolvedValueOnce(failure);
  for (let i = 0; i < 4; i += 1) await register!.reconcile();
  expect(send).toHaveBeenCalledTimes(4);
  const records = logs.mock.calls.map(([entry]) => entry).filter(entry => entry.event === 'ingest.reconciliation_failed');
  expect(records.map(entry => entry.attemptCount)).toEqual([1, 2, 1]);
  for (const entry of records) expect(entry).toEqual({ event: 'ingest.reconciliation_failed', timestamp: expect.any(String), sourceId: zone.sourceId, projectId: zone.projectId, errorCategory: 'dependency_unavailable', attemptCount: expect.any(Number) });
  expect(JSON.stringify(records)).not.toContain(secret);
 });
 it('ING-31/32: real sidecar egress contains only declared metadata and telemetry drops all non-allowlisted fields', async () => {
  const logs = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  rule = { ...rule, verifyColumn: 'owner', verifyValue: 'expected' }; await snapshot();
  await arrive('supplier_2026-03.csv', `owner,quantity\n${secret},123\n`);
  await register!.reconcile();
  const filing = register!.records()[0]!;
  expect(filing.reason).toContain(secret);
  expect(egress.filter((item) => item.path === '/arrival-notice').map((item) => item.body)).toContainEqual(expect.objectContaining({ quarantineCategory: 'verification_mismatch', outcome: 'quarantined' }));
  for (const item of egress) {
   expect(['/arrival-notice','/reconciliation-report']).toContain(item.path);
   expect((item.path === '/arrival-notice' ? arrivalNoticeSchema : reconciliationReportSchema).safeParse(item.body).success).toBe(true);
  }
  expect(JSON.stringify(egress)).not.toContain(secret);
  expect(JSON.stringify(egress)).not.toContain('supplier_2026-03.csv');
  const injected = { event: 'ingest.quarantined', timestamp: '2026-09-20T00:00:00.000Z', sourceId: zone.sourceId, projectId: zone.projectId, errorCategory: 'conflict', attemptCount: 2, filingId: filing.id, columnName: secret, cellValue: secret, reason: filing.reason, contents: secret, filename: filing.path };
  expect(ingestErrorCategory({ code: secret, message: secret })).toBe('unknown');
  expect(ingestErrorCategory(new DomainError('source_unavailable', secret))).toBe('source_unavailable');
  expect(() => ingestAttributes({ ...injected, errorCategory: secret })).toThrow();
  expect(ingestAttributes(injected)).toEqual({ event: 'ingest.quarantined', timestamp: injected.timestamp, sourceId: zone.sourceId, projectId: zone.projectId, filingId: filing.id, errorCategory: 'conflict', attemptCount: 2 });
  ingestEvent(injected);
  expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  for (const [entry] of logs.mock.calls) {
   expect(Object.keys(entry as object).every(key => ['event','timestamp','sourceId','projectId','filingId','errorCategory','attemptCount'].includes(key))).toBe(true);
   expect(entry).toMatchObject({ timestamp: expect.any(String), sourceId: zone.sourceId, projectId: zone.projectId });
  }
 });
 it('recovers a committed filing after local receipt loss, even when its file has disappeared; receipt refusal remains visible', async () => {
  await arrive('supplier_2026-03.csv', 'quantity\n100\n');
  const first = register!.records()[0]!;
  await register!.close(); register = undefined;
  const state = JSON.parse(await readFile(zone.stateFile,'utf8')) as { filings: Array<Record<string, unknown>> };
  delete state.filings[0]!.landing; delete state.filings[0]!.extraction;
  await writeFile(zone.stateFile,JSON.stringify(state)); await rm(join(zone.directory,first.path));
  await openRegister(); await register!.reconcile();
  expect(register!.records()[0]).toMatchObject({ id: first.id, landing: first.landing });
  // The application now refuses a subsequent receipt; customer commit survives.
  vi.spyOn(delivery,'send').mockResolvedValue({ ok: false, error: new DomainError('conflict','Receipt refused for reconciliation.') });
  await arrive('supplier_2026-03_v2.csv','quantity\n125\n');
  expect(register!.records()[1]).toMatchObject({ landing: { registered: false, error: 'Receipt refused for reconciliation.' } });
  expect(unwrap(await repository.list(context.projectId,context.userId,null,100)).find((item) => item.filingId === register!.records()[1]!.id)?.outcome).toBe('landed');
  await register!.reconcile();
  expect(register!.records()[0]).toMatchObject({ landing: { registered: false, error: 'Receipt refused for reconciliation.' } });
 });
 it('delivers pending arrivals and retries notices durably after an unavailable application', async () => {
  await register!.close(); register = undefined;
  const extractor = new SpreadsheetExtractor(new LocalWorkbookReader());
  const failingWriter = { connect: async () => ok(undefined), land: async (): Promise<Result<LandingReceipt>> => err(new DomainError('source_unavailable', 'Customer source unavailable.')) };
  const lander = new FilingLander(zone.directory, { ...zone.landing!, projectId: zone.projectId, sourceId: zone.sourceId }, failingWriter, extractor, delivery);
  const send = vi.spyOn(delivery,'notice').mockResolvedValue(err(new DomainError('dependency_unavailable','Unavailable.')));
  register = await FilingRegister.open(zone,undefined,extractor,lander,delivery);
  await arrive('supplier_2026-03.csv','quantity\n100\n');
  const pending = register.records()[0]!;
  expect(pending).toMatchObject({ status: 'ready', reason: 'Customer source unavailable.' });
  expect(pending.deliveredRevision).toBeUndefined();
  send.mockRestore();
  await register.close(); register = undefined;
  register = await FilingRegister.open(zone,undefined,extractor,lander,delivery); await register.reconcile();
  expect(unwrap(await repository.list(context.projectId,context.userId,null,100))[0]).toMatchObject({ outcome: 'pending', revision: pending.revision });
  const count = egress.length; await register.scan(); expect(egress).toHaveLength(count);
  expect(await delivery.reconcile({ sourceId: zone.sourceId, zoneFileCount: 0, registeredCount: 0, unregisteredCount: 0, checkedAt: new Date().toISOString() },ProjectId(randomUUID()))).toMatchObject({ ok: false });
 });
 it('ING-30: landed columns enter ordinary introspection with no entitlement rows', async () => {
  await arrive('supplier_2026-03.csv','quantity\n100\n');
  const connector = createPostgresConnector({ secrets: new EnvironmentSecretStore({ OPINTEL_SECRET_CUSTOMER_REGISTER: process.env.TEST_DATABASE_URL! }),
    audit: { record: async () => undefined }, limits: { maxConnectionsPerSource: 1, statementTimeoutMs: 2000, operationTimeoutMs: 5000 } });
  const snapshot = unwrap(await connector.introspect({ requestId: 'filing-introspection', projectId: zone.projectId, sourceId: zone.sourceId,
    credentialRef: zone.landing!.credentialRef, payload: { include: [zone.landing!.name] } })).snapshot;
  expect(snapshot.objects).toHaveLength(1);
  expect(snapshot.objects[0]!.columns.map((column) => column.sourceIdentifier)).toEqual([
    'quantity', '_opintel_filing_id', '_opintel_as_at', '_opintel_period', '_opintel_received_at', '_opintel_file_sha256',
  ]);
  // Existing application job consumes the ordinary connector snapshot unchanged.
  const port: SourceConnector = { kind: 'postgres', testConnection: async () => ok(undefined), introspect: async () => ok(snapshot),
    sampleTopValues: async () => ok(new Map()), estimateRowCount: async () => ok(null) };
  const job = new IntrospectionJob(new PostgresIntrospectionStore(new UuidV7IdFactory()), () => port);
  const queued = unwrap(await job.enqueue(context,zone.sourceId));
  const run = unwrap(await job.execute(context,queued.id));
  expect(run.state).toBe('complete');
  expect(run.diff.filter((entry) => entry.type === 'CatalogElementAdded')).toHaveLength(6);
  await withTenant(context,tx=>tx.query("INSERT INTO pool(project_id,name) VALUES($1,'Landing readers')",[context.projectId]));
  expect(await withTenant(context,tx=>tx.query('SELECT * FROM entitlement'))).toEqual([]);
  const [undecided]=await withTenant(context,tx=>tx.query<{count:number}>(`SELECT count(*)::int AS count FROM catalog_element e CROSS JOIN pool p WHERE NOT EXISTS(SELECT 1 FROM entitlement t WHERE t.element_id=e.id AND t.pool_id=p.id)`));
  expect(undecided?.count).toBe(6);
  const elements = await withTenant(context,(tx) => tx.query('SELECT source_identifier FROM catalog_element ORDER BY source_identifier'));
  expect(elements).toEqual(snapshot.objects[0]!.columns.map((column) => column.sourceIdentifier).sort().map((source_identifier) => ({ source_identifier })));
 });
 it('drains an in-flight reconciliation before releasing exclusive register ownership', async () => {
  await register!.close(); register = undefined;
  let entered!: () => void; let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  register = await FilingRegister.open(zone,undefined,undefined,undefined, {
   notice: async () => ok(undefined), reconcile: async () => { entered(); await barrier; return ok(undefined); },
  });
  register.start(); await started;
  const closing = register.close();
  try { expect(await readFile(zone.stateFile+'.lock','utf8')).toBe(String(process.pid)); }
  finally { release(); await closing; register = undefined; }
  await expect(readFile(zone.stateFile+'.lock')).rejects.toMatchObject({ code: 'ENOENT' });
 });
 it('requires project#view, paginates the projection and hides foreign projects', async () => {
  await arrive('unknown.csv',secret); await arrive('another.csv','other');
  let signedIn = true; let allowed = true;
  const authorization = { check: async () => ({ allowed, token: 'token' }) } as unknown as AuthorizationPort;
  browser = createHttpServer(registerRoutes(repository), { authorization: { port: authorization, currentUser: async () => signedIn ? {
   id: context.userId, email: 'reader@example.com', fullName: null, timezone: 'UTC', method: 'magic_link', sessionCreatedAt: new SystemClock().now(), deviceConfirmed: true,
  } : null } });
  await new Promise<void>((resolve) => browser!.listen(0,'127.0.0.1',resolve));
  const address = browser.address(); if (!address || typeof address === 'string') throw new Error();
  const base = `http://127.0.0.1:${address.port}/api/v1/projects/${context.projectId}/filings`;
  const first = filingListResponseSchema.parse(await (await fetch(base+'?limit=1')).json());
  expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
  const second = filingListResponseSchema.parse(await (await fetch(base+'?limit=1&cursor='+first.nextCursor)).json());
  expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull(); expect(first.items[0]!.filingId).not.toBe(second.items[0]!.filingId);
  expect(unwrap(await repository.list(ProjectId(randomUUID()),context.userId,null,100))).toEqual([]);
  allowed = false; expect((await fetch(base)).status).toBe(404);
  signedIn = false; expect((await fetch(base)).status).toBe(401);
 });
});

it('filing register migration runs up/down/up over existing sources without touching them', async () => {
 const db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
 try {
  await db.query('BEGIN'); const schema = 'register_migration_'+randomUUID().replaceAll('-','');
  await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}",public`);
  await db.query('CREATE TABLE data_source (id uuid PRIMARY KEY, project_id uuid NOT NULL, UNIQUE(id,project_id))');
  const source = randomUUID(); await db.query('INSERT INTO data_source VALUES ($1,$2)',[source,randomUUID()]);
  const up = await readFile('migrations/022_filing_register.up.sql','utf8'); const down = await readFile('migrations/022_filing_register.down.sql','utf8');
  await db.query(up); await db.query(down); await db.query(up);
  expect((await db.query('SELECT id FROM data_source')).rows).toEqual([{ id: source }]);
 } finally { await db.query('ROLLBACK'); await db.end(); }
}, 30_000);
