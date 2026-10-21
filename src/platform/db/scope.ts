import { Pool, type PoolClient } from 'pg';
import {sqlAccess,observeSql,sqlAccessKind,type SqlAccess} from './sql-diagnostics.js';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {diagnostic,diagnosticRequest,diagnosticsEnabled,registerDiagnosticPool} from '../telemetry/diagnostics.js';
import type { UserId, ProjectId, ActorRef } from '../../shared/kernel/index.js';

// Private. Never exported. The only way to reach a connection is through
// one of the three scopes below.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
registerDiagnosticPool(()=>({total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount}));

export type StatementSettings = Readonly<{
  jit?: 'on' | 'off';
  /** Integer KiB, from PostgreSQL's 64 KiB minimum to this wrapper's 64 MiB cap. */
  work_mem?: number;
}>;

export interface Tx {
  query<T = unknown>(sql: string, params?: readonly unknown[], settings?: StatementSettings): Promise<T[]>;
}

// No commit, no rollback, no release: the scope owns the lifecycle.
const FORBIDDEN_STATEMENT = /^\s*(SET|RESET|BEGIN|COMMIT|ROLLBACK|SELECT\s+set_config)\b/i;

function permittedSettings(settings: StatementSettings): readonly (readonly ['jit' | 'work_mem', string])[] {
  return Object.entries(settings).map(([name, value]) => {
    if (name === 'jit' && (value === 'on' || value === 'off')) return [name, value] as const;
    if (name === 'work_mem' && typeof value === 'number' && Number.isInteger(value) && value >= 64 && value <= 65_536) return [name, `${value}kB`] as const;
    throw new Error('Statement settings permit only jit (on/off) and work_mem (integer KiB, 64–65536)');
  });
}

const wrap = (c: PoolClient,observe?:SqlAccess): {tx: Tx; drain: () => Promise<void>} => {
  // A statement's local settings must not reach a concurrently queued query.
  let pending: Promise<void> = Promise.resolve();
  const tx: Tx = {query: <T>(sql: string, params?: readonly unknown[], settings?: StatementSettings) => {
   const result = pending.then(async () => {
    if (FORBIDDEN_STATEMENT.test(sql)) {
      throw new Error('Tx.query cannot change session settings or transaction state');
    }
    const permitted = settings ? permittedSettings(settings) : [];
    let previous: {jit: string; work_mem: string} | undefined;
    if (permitted.length) {
      previous = (await c.query<{jit: string; work_mem: string}>("SELECT current_setting('jit') AS jit, current_setting('work_mem') AS work_mem")).rows[0];
      if (!previous) throw new Error('Could not read statement settings');
      for (const [name, value] of permitted) {
        // Names and rendered values come exclusively from the allowlist above.
        await c.query(name === 'jit' ? `SET LOCAL jit = ${value}` : `SET LOCAL work_mem = '${value}'`);
      }
    }
    if(observe)observeSql(observe,sql);
    const rows = (await c.query(sql, params as unknown[])).rows as T[];
    if (previous) await c.query("SELECT set_config('jit', $1, true), set_config('work_mem', $2, true)", [previous.jit, previous.work_mem]);
    // On statement failure the transaction is aborted; scope rollback restores
    // all local settings, without attempting another command in that transaction.
    return rows;
   });
   pending = result.then(() => undefined, () => undefined);
   return result;
  }};
  return {tx, drain: () => pending};
};

type ScopeRole = 'opintel_app' | 'opintel_platform' | 'opintel_platform_admin';

async function run<T>(
  role: ScopeRole,
  setup: (c: PoolClient) => Promise<void>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const measuring=diagnosticsEnabled(),started=measuring?performance.now():0;
  const context=diagnosticRequest(),requestId=context?.requestId??null,acquisitionId=measuring?randomUUID():null,access=measuring?sqlAccess():undefined;
  const startedAt=measuring?new Date().toISOString():null;
  let committed=false;
  let client:PoolClient;
  try {client=await pool.connect();}catch(error){
    if(measuring)diagnostic({kind:'db',requestId,acquisitionId,startedAt,access:'none',waitMs:performance.now()-started,holdMs:0,scope:role,outcome:'acquisition_failed'});
    throw error;
  }
  const acquired=measuring?performance.now():0;
  if(measuring)diagnostic({kind:'db_acquire',requestId,acquisitionId,startedAt,waitMs:acquired-started,scope:role});
  let discardConnection = false;
  let statements: ReturnType<typeof wrap> | undefined;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await setup(client);
    statements = wrap(client,access);
    const result = await fn(statements.tx);
    await statements.drain();
    await client.query('COMMIT');
    committed=true;
    return result;
  } catch (e) {
    try {
      // Promise.all can reject before later queued statements settle. Drain
      // them before rollback/release so none can run outside this scope.
      await statements?.drain();
      await client.query('ROLLBACK');
    } catch {
      discardConnection = true;
    }
    throw e;
  } finally {
    client.release(discardConnection);
    if(measuring)diagnostic({kind:'db',requestId,acquisitionId,startedAt,access:sqlAccessKind(access!),readTables:[...access!.readTables].sort(),writeTables:[...access!.writeTables].sort(),opaque:[...access!.opaque].sort(),read:access!.read,write:access!.write,transaction:committed?'committed':'rolled_back',waitMs:acquired-started,holdMs:performance.now()-acquired,scope:role});
  }
}

export async function withTenant<T>(
  ctx: { userId: UserId; projectId: ProjectId },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return run(
    'opintel_app',
    async (c) => {
      await c.query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.project_id', $2, true)`,
        [ctx.userId, ctx.projectId],
      );
    },
    fn,
  );
}

export async function withPlatform<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run('opintel_platform', async () => {}, fn);
}

export async function withPlatformAdmin<T>(
  _ctx: { actor: ActorRef },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  // TODO item 2.1: write an audit entry for every call, using ctx.actor.
  // The audit_entry table does not exist yet.
  return run('opintel_platform_admin', async () => {}, fn);
}
