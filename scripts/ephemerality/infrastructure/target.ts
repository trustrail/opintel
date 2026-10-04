import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { writeFile, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { v1 } from '@authzed/authzed-node';
import { loadSidecarConfig } from '../../../sidecar/config.js';
import { createSidecarServer, sidecarBuild } from '../../../sidecar/http/server.js';
import { PostgresConnector } from '../../../sidecar/infrastructure/postgres-connector.js';
import { PostgresSourceScope, type SourceSession } from '../../../sidecar/infrastructure/postgres-source-scope.js';
import { PostgresStagingSource } from '../../../sidecar/execution/infrastructure/postgres-source.js';
import { StagedExecutor } from '../../../sidecar/execution/application/execute.js';
import { ExecutionQueue } from '../../../sidecar/execution/application/queue.js';
import type { StagingSource } from '../../../sidecar/execution/index.js';
import { DuckDBSessionEngine, type EngineSession } from '../../../sidecar/session/index.js';
import { SidecarTokenizer, IanaZoneResolver } from '../../../sidecar/tokenize/index.js';
import { executionRequest } from '../../../src/shared/execution-contract.js';
import { PostgresEvidenceWriter } from '../../../src/modules/evidence/index.js';
import { withTenant } from '../../../src/platform/db/scope.js';
import { queryFixture } from '../../../test/fixtures/query/fixture.js';

const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
// Capture actual production telemetry to a separate sink. No SQL observers are
// installed. Harness reports contain only identifiers, counts and digests.
console.info = (...values: unknown[]) => { process.stderr.write(JSON.stringify(values) + '\n'); };
console.warn = console.info;
console.error = console.info;
const native = createRequire(import.meta.url)('/work/scripts/ephemerality/infrastructure/address.node') as { address(buffer: Buffer): bigint };
const command = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('start'), mode: z.enum(['engine', 'application']), controls: z.array(z.strictObject({ name: z.string(), value: z.string(), encoding: z.enum(['utf8', 'utf16le']) })).min(2) }),
  z.strictObject({ op: z.literal('scenario'), name: z.enum(['success', 'cancel', 'deadline', 'source_failure', 'staging_failure', 'memory_pressure']) }),
  z.strictObject({ op: z.literal('resume') }), z.strictObject({ op: z.literal('expire') }),
  z.strictObject({ op: z.literal('evidence') }), z.strictObject({ op: z.literal('stop') }),
]);
const allocations: Buffer[] = [];
let stop: (() => Promise<void>) | undefined;
let app: Awaited<ReturnType<typeof queryFixture>> | undefined;
let scenario = 'success';
let appended = 0;
let opened = 0, closed = 0, prepared = 0, released = 0, sourceOpen = 0;
let stagingChecks = 0, appendChecks = 0, appendedRows = 0;
let sourceSignal: AbortSignal | undefined;
let resume: (() => void) | undefined;
let expire = () => {};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function gate(signal: AbortSignal): Promise<void> {
  emit({ event: 'gate', opened, closed, sourceOpen, appended });
  await new Promise<void>(resolve => {
    const finish = () => { signal.removeEventListener('abort', finish); resume = undefined; resolve(); };
    resume = finish;
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}
class ObservedScope extends PostgresSourceScope {
  override run<T>(key: string, ref: Parameters<PostgresSourceScope['run']>[1], work: (session: SourceSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return super.run(key, ref, async session => {
      sourceOpen++;
      let fetched = 0;
      try { return await work({ query: async (sql, values) => {
        if (sql.startsWith('FETCH')) {
          fetched++;
          if (scenario === 'source_failure' && fetched === 2) {
            // Real Postgres failure after the first batch crossed into staging.
            await session.query('SELECT * FROM s4_missing_relation');
          }
        }
        return session.query(sql, values);
      } }); } finally { sourceOpen--; }
    }, signal);
  }
  override external<T>(key: string, ref: Parameters<PostgresSourceScope['external']>[1], work: (connection: string, signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    return super.external(key, ref, async (connection, scopeSignal) => {
      sourceOpen++;
      try { return await work(connection, scopeSignal); } finally { sourceOpen--; }
    }, signal);
  }
}
async function observeTable(session: EngineSession, catalog: string, schema: string, table: string): Promise<void> {
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
  const ref = [catalog, schema, table].map(quote).join('.');
  const columns = await session.execute(`SELECT column_name FROM duckdb_columns() WHERE database_name='${catalog}' AND schema_name='${schema}' AND table_name='${table}' ORDER BY column_index`);
  const names = z.array(z.tuple([z.string()])).parse(columns.rows).map(row => row[0]);
  const count = await session.execute(`SELECT count(*) FROM ${ref}`);
  const hashes: Record<string, string> = {};
  for (const name of names.filter(name => name !== 'id')) {
    const values = await session.execute(`SELECT DISTINCT ${quote(name)} FROM ${ref}`);
    hashes[name] = digest(values.rows);
  }
  stagingChecks++;
  emit({ event: 'staged', catalog, schema, table, names, count: Number(count.rows[0]?.[0]), hashes });
}
async function start(input: Extract<z.infer<typeof command>, { op: 'start' }>): Promise<void> {
  const ranges = [];
  const file = Buffer.alloc(1024 * 1024 + 4096, 46);
  for (const [index, control] of input.controls.entries()) {
    const bytes = Buffer.from(control.value, control.encoding);
    const buffer = Buffer.alloc(128 * 1024, 0);
    const offset = 65536 - 7;
    bytes.copy(buffer, offset); allocations.push(buffer);
    ranges.push({ name: control.name, start: String(native.address(buffer) + BigInt(offset)), size: bytes.length });
    bytes.copy(file, 1024 * 1024 - 7 + index * 256);
  }
  const forbiddenWrites = [];
  for (const path of ['/tmp/s4-write', '/dev/shm/s4-write', '/work/s4-write', '/s4-write']) {
    try { await writeFile(path, 'S4 forbidden write'); throw new Error('Forbidden write succeeded'); }
    catch (error: unknown) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && ['EROFS', 'EACCES'].includes(String(error.code)))) throw error;
      forbiddenWrites.push({path, code: String(error.code)});
    }
  }
  emit({event: 'forbidden_writes', attempts: forbiddenWrites});
  await writeFile('/ingest/control/live.bin', file);
  // The end-of-run filesystem scan cannot find this; syscall observation must.
  await writeFile('/ingest/control/transient.bin', Buffer.from(input.controls[0]!.value));
  await unlink('/ingest/control/transient.bin');
  console.info({ event: 's4.positive-control', marker: input.controls[0]!.value });
  if (input.mode === 'application') {
    app = await queryFixture(new PostgresEvidenceWriter(), { security: v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS, sourceLimits: { maxConnectionsPerSource: 2, statementTimeoutMs: 1000000, operationTimeoutMs: 1000000 }, queryTimeoutSeconds: 1000, sidecarDirectory: '/ingest/control/tls-config' }); stop = app.close;
    emit({ event: 'ready', mode: input.mode, pid: process.pid, nodeVersion: process.versions.node, ranges, schema: app.schema, url: app.url.toString(), key: app.issued.key, session: app.transport.sessionId });
    return;
  }
  const { config, tls } = await loadSidecarConfig('/ingest/control/tls-config/service.json');
  const scope = new ObservedScope({ resolve: async () => process.env.TEST_DATABASE_URL! }, { maxConnectionsPerSource: 2, statementTimeoutMs: 1000000, operationTimeoutMs: 1000000 });
  const source = new PostgresStagingSource(scope, new SidecarTokenizer({ resolveBytes: async () => Buffer.alloc(32, 1) }, new IanaZoneResolver()));
  const observed: StagingSource = {
    estimate: (scan, signal) => source.estimate(scan, signal),
    plain: (scan, session, table, signal) => source.plain(scan, session, table, signal),
    treated: (scan, consume, signal) => { sourceSignal = signal; return source.treated(scan, consume, signal); },
  };
  const executor = new StagedExecutor(observed, request => {
    const driver = new DuckDBSessionEngine(undefined, event => {
      if (event.stage === 'prepared') prepared++;
      if (event.stage === 'released') released++;
    }, '/work/tmp/duckdb-extensions/postgres_scanner.duckdb_extension', request.limits);
    return { open: async role => {
      const session = await driver.open(role); opened++;
      const spill = await session.execute("SELECT current_setting('temp_directory'),current_setting('max_temp_directory_size')");
      emit({ event: 'spill', role, rows: spill.rows });
      const close = session.close;
      session.close = () => { close(); closed++; };
      if (session.staging) {
        const declarations = new Map<string, string[]>();
        const create = session.staging.create;
        session.staging.create = async (catalog, schema, table, columns) => {
          declarations.set(table, columns.map(column => column.name));
          return create(catalog, schema, table, columns);
        };
        const append = session.staging.append;
        session.staging.append = async (catalog, schema, table, rows) => {
          appended++;
          const names = declarations.get(table);
          if (!names) throw new Error('Missing staging declaration');
          const hashes: Record<string, string[]> = {};
          for (const [index, name] of names.entries()) if (name !== 'id') hashes[name] = [...new Set(rows.map(row => digest([[row[index]]])))];
          appendChecks++; emit({ event: 'append', names, hashes, count: rows.length });
          if (appended === 2 && ['cancel', 'deadline'].includes(scenario)) await gate(sourceSignal!);
          if (appended === 2 && scenario === 'staging_failure') return append(catalog, schema, table + '_missing', rows);
          try { await append(catalog, schema, table, rows); }
          catch (error: unknown) {
            const message = typeof error === 'string' ? error : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : '';
            emit({ event: 'native_staging_failure', memoryExhausted: /out of memory|failed to allocate|memory limit/iu.test(message), errorKind: error instanceof Error ? 'Error' : typeof error });
            throw error;
          }
          appendedRows += rows.length;
        };
        const transfer = session.staging.transfer;
        session.staging.transfer = async (table, target, agent) => {
          await observeTable(session, 'memory', '__staging', table);
          await transfer(table, target, agent);
          await observeTable(agent, target.catalog, target.schema, target.name);
        };
      }
      return session;
    } };
  }, new ExecutionQueue(), { after: (ms, callback) => {
    expire = callback; const timer = setTimeout(callback, ms); return () => clearTimeout(timer);
  } });
  const host = createSidecarServer({ config: { ...config, port: 0 }, tls, connector: new PostgresConnector(scope, { record: async () => {} }), execution: {
    validate: (body, signal) => executor.validate(body, signal),
    execute: async (body, signal) => {
      executionRequest.parse(body);
      const result = await executor.execute(body, signal);
      emit({ event: 'teardown', ok: result.ok, code: result.ok ? undefined : result.error.code, opened, closed, prepared, released, sourceOpen, stagingChecks, appendChecks, appended, appendedRows });
      return result;
    },
  }, build: { ...sidecarBuild, queryEngineVersion: 'v1.4.3/d1dc88f950' } });
  stop = host.close;
  emit({ event: 'ready', mode: input.mode, pid: process.pid, nodeVersion: process.versions.node, ranges, port: await host.listen() });
}

for await (const line of createInterface({ input: process.stdin })) {
  const input = command.parse(JSON.parse(line) as unknown);
  if (input.op === 'start') await start(input);
  if (input.op === 'scenario') { scenario = input.name; appended = 0; emit({ event: 'configured' }); }
  if (input.op === 'resume') resume?.();
  if (input.op === 'expire') expire();
  if (input.op === 'evidence') {
    if (!app) throw new Error('Application not started');
    const evidence = await withTenant(app.ctx, async tx => {
      const runs = await tx.query<{ id: string; started_at: string }>('SELECT id,started_at::text AS started_at FROM query_run WHERE pool_id=$1', [app!.pool]);
      const contents: unknown[] = [];
      const counts: Record<string, number> = {};
      for (const run of runs) for (const table of ['query_run', 'run_completion', 'run_stage', 'run_element', 'evidence_redaction']) {
        const id = table === 'query_run' ? 'id' : 'run_id';
        const records = await tx.query(`SELECT to_jsonb(r) AS record FROM ${table} r WHERE ${id}=$1 AND started_at=$2`, [run.id, run.started_at]);
        counts[table] = (counts[table] ?? 0) + records.length;
        contents.push(...records);
      }
      return { count: runs.length, counts, contents };
    });
    emit({ event: 'evidence', ...evidence });
  }
  if (input.op === 'stop') { await stop?.(); allocations.length = 0; process.exit(0); }
}
