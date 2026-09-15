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

async function run<T>(
  setup: (c: PoolClient) => Promise<void>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setup(client);
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    await client.query('RESET app.user_id');
    await client.query('RESET app.project_id');
    client.release();
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
      client.release();
    } catch {
      client.release(true);   // unknown state: destroy, do not reuse
    }
    throw e;
  }
}

export async function withTenant<T>(
  ctx: { userId: UserId; projectId: ProjectId },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return run(
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
  return run(async () => {}, fn);
}

export async function withPlatformAdmin<T>(
  _ctx: { actor: ActorRef },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  // TODO item 2.1: write an audit entry for every call, using ctx.actor.
  // The audit_entry table does not exist yet.
  return run(async () => {}, fn);
}
