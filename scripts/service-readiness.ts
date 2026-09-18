// Operational bootstrap/preflight: these connections inspect database existence
// and migration metadata before application scopes can run. No tenant data is read.
import { Client } from 'pg';
import { v1 } from '@authzed/authzed-node';
import { createClient } from 'redis';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { DevEnvironment } from './dev-environment.js';

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

export async function checkTestDatabase(connectionString: string): Promise<void> {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
  try {
    try { await client.connect(); } catch (error) {
      if (errorCode(error) === '3D000') throw new Error(`Test database "${name}" is missing.`);
      throw new Error(`Test database "${name}" is unavailable at ${url.hostname}:${url.port || '5432'} (check PostgreSQL and credentials).`);
    }
    const ledger = await client.query<{ ledger: string | null }>("SELECT to_regclass('public.schema_migration')::text AS ledger");
    if (!ledger.rows[0]?.ledger) throw new Error(`Test database "${name}" has no migrations applied (schema_migration is missing).`);
    const applied = await client.query<{ version: string; checksum: string }>('SELECT version, checksum FROM schema_migration');
    const checksums = new Map(applied.rows.map((row) => [row.version, row.checksum]));
    const directory = new URL('../migrations/', import.meta.url);
    const missing: string[] = [];
    for (const file of (await readdir(directory)).filter((file) => file.endsWith('.up.sql')).sort()) {
      const version = file.split('_')[0];
      const checksum = createHash('sha256').update(await readFile(new URL(file, directory))).digest('hex');
      if (version === undefined || checksums.get(version) !== checksum) missing.push(file);
    }
    if (missing.length > 0) throw new Error(`Test database "${name}" has missing or mismatched migrations: ${missing.join(', ')}.`);
  } finally { await client.end(); }
}

export function spiceDbClient(environment: DevEnvironment): v1.ZedClientInterface {
  const endpoint = environment.spiceDbEndpoint;
  return v1.NewClient(environment.spiceDbToken, endpoint,
    endpoint.startsWith('localhost:') || endpoint.startsWith('127.0.0.1:')
      ? v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED : v1.ClientSecurity.SECURE);
}

export async function checkSpiceDb(environment: DevEnvironment, requireSchema = true): Promise<void> {
  const client = spiceDbClient(environment);
  try {
    let schema: string;
    try {
      const response = await new Promise<v1.ReadSchemaResponse>((resolve, reject) => {
        client.readSchema(v1.ReadSchemaRequest.create({}), { deadline: Date.now() + 5_000 }, (error, result) => {
          if (error) reject(error);
          else if (result) resolve(result);
          else reject(new Error('SpiceDB returned no schema response.'));
        });
      });
      schema = response.schemaText;
    } catch (error) {
      // An empty datastore answers NOT_FOUND: the service is ready for schema loading.
      if (errorCode(error) === 5) {
        if (!requireSchema) return;
        throw new Error(`SpiceDB schema is missing at ${environment.spiceDbEndpoint}.`);
      }
      throw new Error(`SpiceDB is unavailable at ${environment.spiceDbEndpoint} (check the service and SPICEDB_TOKEN).`);
    }
    if (!requireSchema) return;
    const expected = await readFile(new URL('../docs/opintel-schema.zed', import.meta.url), 'utf8');
    const normalize = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '')
      .split(/(?=\bdefinition\s)/u).map((definition) => definition.replace(/\s+/gu, '')).sort().join('');
    if (normalize(schema) !== normalize(expected)) throw new Error(`SpiceDB schema is missing or outdated at ${environment.spiceDbEndpoint} (expected docs/opintel-schema.zed).`);
  } finally { client.close(); }
}

export async function checkRedis(redisUrl: string): Promise<void> {
  const client = createClient({ url: redisUrl, socket: { connectTimeout: 5_000, reconnectStrategy: false } });
  client.on('error', () => {});
  try { await client.connect(); await client.ping(); } catch {
    const url = new URL(redisUrl);
    throw new Error(`Redis is unavailable at ${url.hostname}:${url.port || '6379'}.`);
  } finally { if (client.isOpen) client.destroy(); }
}

export async function testPreflight(environment: DevEnvironment): Promise<void> {
  const results = await Promise.allSettled([
    checkTestDatabase(environment.testDatabaseUrl), checkSpiceDb(environment), checkRedis(environment.redisUrl),
  ]);
  const failures = results.flatMap((result) => result.status === 'rejected'
    ? [result.reason instanceof Error ? result.reason.message : 'Service readiness check failed.'] : []);
  if (failures.length > 0) throw new Error(`Test prerequisites are not ready:\n${failures.map((message) => `  - ${message}`).join('\n')}\nRun npm run dev:up, then npm test. No test suites were started.`);
}
