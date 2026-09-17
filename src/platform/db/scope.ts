import { Pool, type PoolClient } from 'pg';
import type { UserId, ProjectId, ActorRef } from '../../shared/kernel/index.js';

// Private. Never exported. The only way to reach a connection is through
// one of the three scopes below.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Tx {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

// No commit, no rollback, no release: the scope owns the lifecycle.
const FORBIDDEN_STATEMENT = /^\s*(SET|RESET|BEGIN|COMMIT|ROLLBACK|SELECT\s+set_config)\b/i;

const wrap = (c: PoolClient): Tx => ({
  query: async <T>(sql: string, params?: readonly unknown[]) => {
    if (FORBIDDEN_STATEMENT.test(sql)) {
      throw new Error('Tx.query cannot change session settings or transaction state');
    }
    return (await c.query(sql, params as unknown[])).rows as T[];
  },
});

type ScopeRole = 'opintel_app' | 'opintel_platform' | 'opintel_platform_admin';

async function run<T>(
  role: ScopeRole,
  setup: (c: PoolClient) => Promise<void>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discardConnection = false;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await setup(client);
    const result = await fn(wrap(client));
    await client.query('COMMIT');
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
