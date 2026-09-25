import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ProjectId, SourceId } from '../src/shared/kernel/index.js';
import { EnvironmentSecretStore, environmentVariableFor, SecretRef } from '../src/platform/secrets/index.js';
import { PostgresSourceScope } from '../sidecar/infrastructure/postgres-source-scope.js';
import { IanaZoneResolver, SidecarTokenizer } from '../sidecar/tokenize/index.js';
import { TokenizedSourceReader } from '../sidecar/tokenize/infrastructure/source-reader.js';

const projectId = ProjectId(randomUUID());
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const database = 'token_customer_' + randomUUID().replaceAll('-', '');
const customer = new URL(process.env.TEST_DATABASE_URL!); customer.pathname = '/' + database;
const owner = new Client({ connectionString: process.env.TEST_DATABASE_URL });
let landing: Client;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const credential = SecretRef('secret://test/token-source');
const keyRef = SecretRef(`secret://opintel/token-key/${projectId}`);
const secrets = new EnvironmentSecretStore({ OPINTEL_SECRET_TEST_TOKEN_SOURCE: customer.toString(), [environmentVariableFor(keyRef)]: key.toString('hex') });
const scope = new PostgresSourceScope(secrets, { maxConnectionsPerSource: 2, statementTimeoutMs: 5000, operationTimeoutMs: 15000 });
const reader = new TokenizedSourceReader(scope, new SidecarTokenizer(secrets, new IanaZoneResolver()));
const config = { domain: 'c', canonId: 'stdnum1', mode: 'number' as const };
const request = (object: string) => ({ projectId, sourceId: SourceId(randomUUID()), credentialRef: credential, schema: 'public', object, columns: [{ name: 'id', config }] });

beforeAll(async () => {
  // Private customer fixture and owner-only security inspection. Product reads
  // below go through the existing customer source scope, never an app connection.
  await owner.connect(); await owner.query(`CREATE DATABASE ${quote(database)}`);
  landing = new Client({ connectionString: customer.toString() }); await landing.connect();
  await landing.query(`CREATE TABLE a(id numeric, raw bytea, note text); CREATE TABLE b(id bigint);
    INSERT INTO a(id,note) VALUES (7,'first'),(8,'second'),(8,'third'),(NULL,'absent'); INSERT INTO b VALUES (7),(8),(9),(NULL);
    CREATE TABLE precise(n numeric, ts timestamptz, naive timestamp, day date, f double precision);
    INSERT INTO precise VALUES (1234567890123456789012345678901234567890,
      '2026-09-21 15:30:00.123456+00', '2026-09-21 11:30:00.123456', '2026-09-21',7.0)`);
}, 30000);
afterAll(async () => {
  await landing?.end();
  try { await owner.query(`DROP DATABASE IF EXISTS ${quote(database)}`); } finally { await owner.end(); }
}, 30000);

it('TOK-01/TOK-10/H-006: two source identities join on tokens with the same row count as plaintext', async () => {
  const a: (string | null)[] = [], b: (string | null)[] = [];
  expect(await reader.read(request('a'), async row => { a.push(row.id!); })).toEqual({ ok: true, value: 4 });
  expect(await reader.read(request('b'), async row => { b.push(row.id!); })).toEqual({ ok: true, value: 4 });
  expect(a[0]).toBe(b[0]);
  const joins = a.filter(value => value !== null).flatMap(value => b.filter(other => other === value)).length;
  const plain = await landing.query<{ count: string }>('SELECT count(*) FROM a JOIN b USING(id)');
  expect(joins).toBe(parseInt(plain.rows[0]!.count, 10));
}, 30000);

it('TOK-37: actual Postgres reads retain numeric precision, timestamp microseconds and source text', async () => {
  const query: string[] = [];
  const observed: unknown[] = [];
  const wrapped: Pick<PostgresSourceScope, 'run'> = { run: (source, ref, work, signal) => scope.run(source, ref, session => work({ query: async (sql, values) => {
    query.push(sql); const rows = await session.query(sql, values);
    if (sql.startsWith('FETCH')) observed.push(...structuredClone(rows));
    return rows;
  } }), signal) };
  const boundary = new TokenizedSourceReader(wrapped, new SidecarTokenizer(secrets, new IanaZoneResolver()));
  const columns = [
    { name: 'n', config },
    { name: 'ts', config: { domain: 'c', canonId: 'stdtime1', mode: 'timestamp' } },
    { name: 'naive', config: { domain: 'c', canonId: 'stdtime1', mode: 'timestamp', declaredZone: 'America/New_York' } },
    { name: 'day', config: { domain: 'c', canonId: 'stddate1', mode: 'date' } },
  ];
  const rows: Readonly<Record<string, string | null>>[] = [];
  expect(await boundary.read({ ...request('precise'), columns }, async row => { rows.push(row); })).toEqual({ ok: true, value: 1 });
  expect(observed).toEqual([{ c0: '1234567890123456789012345678901234567890', c1: '2026-09-21 15:30:00.123456+00', c2: '2026-09-21 11:30:00.123456', c3: '2026-09-21' }]);
  expect(rows[0]!.ts).toBe(rows[0]!.naive);
  expect(Object.values(rows[0]!).every(value => value?.startsWith('v1_c_'))).toBe(true);
  expect(query.some(sql => sql.includes("set_config('TimeZone', 'UTC'"))).toBe(true);
  for (const sql of query) expect(sql).not.toContain(key.toString('hex'));
  const consume = vi.fn();
  expect(await boundary.read({ ...request('precise'), columns: [{ name: 'f', config }] }, consume)).toMatchObject({ ok: false });
  expect(consume).not.toHaveBeenCalled();
}, 30000);

async function scan(db: Client) {
  // Includes all ordinary/partitioned tables in every non-system schema and
  // text/bytea domains, not just a selected list of presumed sensitive columns.
  const columns = await db.query<{ schema: string; table: string; column: string; binary: boolean }>(`
    WITH RECURSIVE types AS (
      SELECT oid, oid AS base, typbasetype FROM pg_type
      UNION ALL SELECT types.oid,t.oid,t.typbasetype FROM types JOIN pg_type t ON t.oid=types.typbasetype
    ) SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,
        types.base='bytea'::regtype AS binary
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN types ON types.oid=a.atttypid AND types.typbasetype=0
      WHERE c.relkind IN ('r','p','m') AND a.attnum>0 AND NOT a.attisdropped
        AND left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
        AND types.base IN ('text'::regtype,'varchar'::regtype,'bpchar'::regtype,'name'::regtype,'bytea'::regtype,'json'::regtype,'jsonb'::regtype)`);
  const matches: string[] = [];
  for (const column of columns.rows) {
    const value = column.binary ? quote(column.column) : `convert_to(${quote(column.column)}::text,'UTF8')`;
    const result = await db.query<{ found: boolean }>(`SELECT EXISTS(SELECT 1 FROM ${quote(column.schema)}.${quote(column.table)} WHERE position($1::bytea in ${value})>0 OR position($2::bytea in ${value})>0 OR position($3::bytea in ${value})>0) AS found`, [key, Buffer.from(key.toString('hex')), Buffer.from(key.toString('base64'))]);
    if (result.rows[0]!.found) matches.push(`${column.schema}.${column.table}.${column.column}`);
  }
  return { count: columns.rows.length, matches };
}

it('TOK-14: full runs leave no raw, hex or base64 key in any application or customer text/bytea column', async () => {
  expect((await reader.read(request('a'), async () => {})).ok).toBe(true);
  expect((await reader.read(request('b'), async () => {})).ok).toBe(true);
  const app = await scan(owner), source = await scan(landing);
  expect(app.count).toBeGreaterThan(0); expect(source.count).toBeGreaterThan(0);
  expect(app.matches).toEqual([]); expect(source.matches).toEqual([]);
  // Prove the scanner detects every representation, using a rollback-only
  // canary in the private customer fixture, after the actual absence assertion.
  await landing.query('BEGIN');
  try {
    await landing.query('CREATE TABLE scan_canary(t text,b bytea)');
    for (const representation of [key, Buffer.from(key.toString('hex')), Buffer.from(key.toString('base64'))]) {
      await landing.query('INSERT INTO scan_canary(b) VALUES ($1)', [representation]);
      expect((await scan(landing)).matches).toContain('public.scan_canary.b');
      await landing.query('DELETE FROM scan_canary');
    }
    for (const representation of [key.toString('hex'), key.toString('base64')]) {
      await landing.query('INSERT INTO scan_canary(t) VALUES ($1)', [representation]);
      expect((await scan(landing)).matches).toContain('public.scan_canary.t');
      await landing.query('DELETE FROM scan_canary');
    }
  } finally { await landing.query('ROLLBACK'); }
}, 60000);

it('resolves compiled canonicalisers at the read boundary and refuses unregistered ids before source contact', async () => {
  const { canonicalisers, createCanonicaliserRegistry } = await import('../sidecar/tokenize/canonicalisers/index.js');
  const { fixture1 } = await import('./fixtures/canonicalisers/reviewed.js');
  await landing.query("CREATE TABLE canonical_input(value text); INSERT INTO canonical_input VALUES ('AB-12'),('AB12')");
  const boundary = new TokenizedSourceReader(scope, new SidecarTokenizer(secrets,new IanaZoneResolver()),createCanonicaliserRegistry([...canonicalisers.entries,fixture1]));
  const input = {...request('canonical_input'),columns:[{name:'value',config:{domain:'c',canonId:'fixture1',mode:'text'}}]};
  const tokens:(string|null)[]=[];
  expect(await boundary.read(input,async row=>{tokens.push(row.value!);})).toEqual({ok:true,value:2});
  expect(tokens[0]).toBe(tokens[1]);
  const sourceContact = vi.spyOn(scope,'run');
  try {
    const consume=vi.fn();
    expect(await reader.read(input,consume)).toMatchObject({ok:false,error:{code:'validation_failed'}});
    expect(sourceContact).not.toHaveBeenCalled();expect(consume).not.toHaveBeenCalled();
  } finally {sourceContact.mockRestore();}
},30000);
