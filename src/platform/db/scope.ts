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

export interface Tx {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

// No commit, no rollback, no release: the scope owns the lifecycle.
const FORBIDDEN_STATEMENT = /^\s*(SET|RESET|BEGIN|COMMIT|ROLLBACK|SELECT\s+set_config)\b/i;

const wrap = (c: PoolClient,observe?:SqlAccess): Tx => ({
  query: async <T>(sql: string, params?: readonly unknown[]) => {
    if (FORBIDDEN_STATEMENT.test(sql)) {
      throw new Error('Tx.query cannot change session settings or transaction state');
    }
    if(observe)observeSql(observe,sql);
    return (await c.query(sql, params as unknown[])).rows as T[];
  },
});

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
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await setup(client);
    const result = await fn(wrap(client,access));
    await client.query('COMMIT');
    committed=true;
    return result;
  } catch (e) {
    try {
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
