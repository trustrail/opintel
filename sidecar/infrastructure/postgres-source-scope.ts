import { Client } from 'pg';
import type { SourceCredentialResolver } from '../application/source-connector.js';
import type { VaultRef } from '../../src/platform/vault/types.js';

export interface SourceSession {
  query(sql: string, values?: unknown[]): Promise<unknown[]>;
}
export interface SourceLimits {
  maxConnectionsPerSource: number;
  statementTimeoutMs: number;
  operationTimeoutMs: number;
}
export class SourceBusy extends Error {}
export class SourceTimeout extends Error {}

/** Customer-source scope. Separate from Opintel's handwritten metadata scopes.
 * Share one instance across the sidecar host to enforce its per-source ceiling. */
export class PostgresSourceScope {
  private readonly active = new Map<string, number>();
  constructor(private readonly credentials: SourceCredentialResolver, private readonly limits: SourceLimits) {
    for (const value of Object.values(limits)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error('Source limits must be positive bounded integers.');
    }
  }

  async run<T>(sourceKey: string, ref: VaultRef, work: (session: SourceSession) => Promise<T>): Promise<T> {
    const count = this.active.get(sourceKey) ?? 0;
    if (count >= this.limits.maxConnectionsPerSource) throw new SourceBusy();
    this.active.set(sourceKey, count + 1);
    let client: Client | undefined;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { expired = true; reject(new SourceTimeout()); }, this.limits.operationTimeoutMs);
    });
    const execute = async (): Promise<T> => {
      const connectionString = await this.credentials.resolve(ref);
      if (expired) throw new SourceTimeout();
      client = new Client({ connectionString, connectionTimeoutMillis: this.limits.operationTimeoutMs,
        statement_timeout: this.limits.statementTimeoutMs, query_timeout: this.limits.operationTimeoutMs,
        application_name: 'opintel-sidecar-connector' });
      // Socket errors are consumed here and are reported safely by the operation.
      client.on('error', () => { expired = true; });
      await client.connect();
      if (expired) throw new SourceTimeout();
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SELECT set_config('statement_timeout', $1, true), set_config('search_path', 'pg_catalog', true)", [String(this.limits.statementTimeoutMs)]);
      const session: SourceSession = { query: async (sql, values) => {
        if (expired || client === undefined) throw new SourceTimeout();
        return (await client.query(sql, values)).rows as unknown[];
      } };
      const result = await work(session);
      if (expired) throw new SourceTimeout();
      await client.query('COMMIT');
      return result;
    };
    try { return await Promise.race([execute(), deadline]); }
    finally {
      expired = true;
      if (timer !== undefined) clearTimeout(timer);
      try { await client?.end(); }
      finally {
        const remaining = (this.active.get(sourceKey) ?? 1) - 1;
        if (remaining === 0) this.active.delete(sourceKey); else this.active.set(sourceKey, remaining);
      }
    }
  }
}
