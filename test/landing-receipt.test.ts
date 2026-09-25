import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarClientOptions } from '../src/modules/sources/index.js';
import { loadSidecarConfig, sidecarConfigSchema } from '../sidecar/config.js';
import { createLandingReceiptServer } from '../src/modules/ingest/api/landing-receipt-server.js';
import { AcceptLandingReceipt } from '../src/modules/ingest/application/landing-receipts.js';
import { PostgresLandingReceiptRepository } from '../src/modules/ingest/infrastructure/landing-receipts.js';
import { HttpsLandingReceipts } from '../sidecar/ingest/infrastructure/receipt-client.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { FilingId, ProjectId, SourceId, UserId } from '../src/shared/kernel/index.js';
import { landingReceiptSchema, landingReceiptOpenApiDocument, type LandingReceipt } from '../src/shared/landing-contract.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';

const context = { projectId: ProjectId(randomUUID()), userId: UserId(randomUUID()) };
const sourceId = SourceId(randomUUID());
const receipt = (): LandingReceipt => ({ filingId: FilingId(randomUUID()), sourceId, projectId: context.projectId, partyCode: '4471', kind: 'claims', period: '2026-03', asAt: '2026-03-31', strategy: 'append_as_at', landedTable: '"source"."n_4471_claims"', rowCount: 2, fileSha256: 'a'.repeat(64), supersedes: null, landedAt: '2026-04-12T10:00:00.000Z' });
let directory: string;
let server: ReturnType<typeof createLandingReceiptServer>;
let url: string;
let client: HttpsLandingReceipts;
let tls: { ca: string; cert: string; key: string; pinnedCertificate: string };
describe('landing receipt over pinned mutual TLS', () => {
  resetDatabaseBeforeEach('company');
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'opintel-receipts-'));
    await prepareSidecarDevelopment(directory);
    const options = await loadSidecarClientOptions(join(directory, 'client.json'));
    server = createLandingReceiptServer(options.tls, new AcceptLandingReceipt(new PostgresLandingReceiptRepository()));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener.');
    url = `https://127.0.0.1:${address.port}`;
    const sidecar = await loadSidecarConfig(join(directory, 'service.json'));
    tls = { ca: sidecar.tls.ca, cert: sidecar.tls.cert, key: sidecar.tls.key, pinnedCertificate: sidecar.tls.clientPin };
    client = new HttpsLandingReceipts(url, tls);
  });
  beforeEach(async () => {
    await withPlatform(async (tx) => {
      const [industry] = await tx.query<{ id: string }>('SELECT id FROM industry LIMIT 1');
      const [company] = await tx.query<{ id: string }>("INSERT INTO company (name,default_region) VALUES ('Landing receipts','eu-west-1') RETURNING id");
      await tx.query("INSERT INTO project (id,company_id,industry_id,name,region) VALUES ($1,$2,$3,'Landing','eu-west-1')", [context.projectId, company!.id, industry!.id]);
    });
    await withTenant(context, (tx) => tx.query("INSERT INTO data_source (id,project_id,kind,name,exposed_alias,credential_ref,receives_landings) VALUES ($1,$2,'postgres','Landings','landings','secret://test/customer',true)", [sourceId, context.projectId]));
  });
  afterAll(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  it('ING-23: first receipt durably fixes strategy; retry is idempotent; a different strategy names both and changes nothing', async () => {
    const first = receipt(); expect(await client.send(first)).toEqual({ ok: true, value: undefined });
    expect(await client.send(first)).toEqual({ ok: true, value: undefined });
    expect(await client.send({ ...receipt(), strategy: 'table_per_filing' })).toMatchObject({ ok: false, error: { message: 'Landing strategy is append_as_at; received table_per_filing.' } });
    expect(await withTenant(context, (tx) => tx.query('SELECT landing_strategy FROM data_source WHERE id=$1', [sourceId]))).toEqual([{ landing_strategy: 'append_as_at' }]);
    expect(await withTenant(context, (tx) => tx.query('SELECT payload FROM landing_receipt'))).toEqual([{ payload: first }]);
    await expect(withTenant(context, (tx) => tx.query("UPDATE data_source SET landing_strategy='table_per_filing' WHERE id=$1", [sourceId]))).rejects.toMatchObject({ code: '23514' });
    expect(await client.send({ ...first, rowCount: 100 })).toMatchObject({ ok: false });
  });
  it.each([
    ['append_as_at', 'table_per_filing'],
    ['table_per_filing', 'append_as_at'],
  ] as const)('ING-23: application refuses a %s source receipt carrying %s, naming both strategies', async (stored, incoming) => {
    await withTenant(context, (tx) => tx.query('UPDATE data_source SET landing_strategy=$2 WHERE id=$1', [sourceId, stored]));
    const conflicting = { ...receipt(), strategy: incoming };

    // Exercise the application listener and its real tenant repository over
    // pinned mTLS, independently of the sidecar's local strategy lock.
    expect(await client.send(conflicting)).toMatchObject({ ok: false, error: {
      code: 'conflict', message: `Landing strategy is ${stored}; received ${incoming}.`,
    } });
    expect(await withTenant(context, (tx) => tx.query(
      'SELECT landing_strategy, first_landed_at FROM data_source WHERE id=$1', [sourceId],
    ))).toEqual([{ landing_strategy: stored, first_landed_at: null }]);
    expect(await withTenant(context, (tx) => tx.query('SELECT filing_id FROM landing_receipt WHERE filing_id=$1', [conflicting.filingId]))).toEqual([]);
  });
  it('accepts a pack-independent kind over the wire and rejects an empty kind in the shared/OpenAPI contract', async () => {
    const arbitrary = { ...receipt(), kind: 'inventory' };
    expect(await client.send(arbitrary)).toEqual({ ok: true, value: undefined });
    expect(await withTenant(context, (tx) => tx.query('SELECT payload FROM landing_receipt'))).toEqual([{ payload: arbitrary }]);
    expect(landingReceiptSchema.safeParse({ ...arbitrary, kind: '' }).success).toBe(false);
    const schema = landingReceiptOpenApiDocument().paths['/landing-receipt'].post.requestBody.content['application/json'].schema;
    expect(schema.properties?.kind).toMatchObject({ type: 'string', minLength: 1 });
    expect(schema.properties?.kind).not.toHaveProperty('enum');
  });
  it('ING-25: only sources receiving landings require a strategy before connection', async () => {
    await expect(withTenant(context, (tx) => tx.query("UPDATE data_source SET status='connected' WHERE id=$1", [sourceId]))).rejects.toMatchObject({ code: '23514' });
    await withTenant(context, (tx) => tx.query("UPDATE data_source SET receives_landings=false,status='connected' WHERE id=$1", [sourceId]));
    expect(await client.send(receipt())).toMatchObject({ ok: false, error: { message: 'This source does not receive landings.' } });
    expect(sidecarConfigSchema.safeParse({ ...(await loadSidecarConfig(join(directory, 'service.json'))).config, receiptUrl: url, landingZones: [{ sourceId, projectId: context.projectId, directory: '/zone', rulesFile: '/rules', stateFile: '/state', landing: { name: 'land', credentialRef: 'secret://test/source' } }] }).success).toBe(false);
  });
  it('rejects the wrong certificate on either end and a receipt for a foreign project', async () => {
    const options = await loadSidecarClientOptions(join(directory, 'client.json'));
    expect(await new HttpsLandingReceipts(url, { ...tls, cert: options.tls.cert, key: options.tls.key }).send(receipt())).toMatchObject({ ok: false });
    expect(await new HttpsLandingReceipts(url, { ...tls, pinnedCertificate: tls.cert }).send(receipt())).toMatchObject({ ok: false });
    expect(await client.send({ ...receipt(), projectId: ProjectId(randomUUID()) })).toMatchObject({ ok: false });
    expect(await withTenant(context, (tx) => tx.query('SELECT payload FROM landing_receipt'))).toEqual([]);
  });
});

it('landing migration expands populated rows safely and rolls down/up', async () => {
  // Isolated migration DDL fixture, rolled back; no application scope bypass.
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await db.connect();
  try {
    await db.query('BEGIN'); const schema = 'landing_migration_' + randomUUID().replaceAll('-', '');
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}",public`);
    await db.query('CREATE TABLE data_source (id uuid PRIMARY KEY, project_id uuid NOT NULL, status text, UNIQUE(id,project_id)); CREATE TABLE cedant_file_rule (id uuid PRIMARY KEY)');
    const id = randomUUID(); await db.query("INSERT INTO data_source VALUES ($1,$2,'connected')", [id, randomUUID()]);
    await db.query('INSERT INTO cedant_file_rule VALUES (gen_random_uuid())');
    const up = await readFile(new URL('../migrations/019_landing.up.sql', import.meta.url), 'utf8');
    const down = await readFile(new URL('../migrations/019_landing.down.sql', import.meta.url), 'utf8');
    await db.query(up);
    expect((await db.query('SELECT receives_landings,landing_strategy FROM data_source')).rows).toEqual([{ receives_landings: false, landing_strategy: null }]);
    await db.query(down); expect((await db.query('SELECT id FROM data_source')).rows).toEqual([{ id }]);
    await db.query(up);
  } finally { await db.query('ROLLBACK'); await db.end(); }
}, 30_000);
