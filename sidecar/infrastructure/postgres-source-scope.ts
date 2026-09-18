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
export class SourceCancelled extends Error {}

/** Customer-source scope. Separate from Opintel's handwritten metadata scopes.
 * Share one instance across the sidecar host to enforce its per-source ceiling. */
export class PostgresSourceScope {
  private readonly active = new Map<string, number>();
  constructor(private readonly credentials: SourceCredentialResolver, private readonly limits: SourceLimits) {
    for (const value of Object.values(limits)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error('Source limits must be positive bounded integers.');
    }
  }

  async run<T>(sourceKey: string, ref: VaultRef, work: (session: SourceSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new SourceCancelled();
    const count = this.active.get(sourceKey) ?? 0;
    if (count >= this.limits.maxConnectionsPerSource) throw new SourceBusy();
    this.active.set(sourceKey, count + 1);
    let client: Client | undefined;
    let expired = false;
    let backendPid: number | undefined;
    let credential: string | undefined;
    let abortOperation: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abortOperation = () => { expired = true; reject(new SourceCancelled()); };
      signal?.addEventListener('abort', abortOperation, { once: true });
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { expired = true; reject(new SourceTimeout()); }, this.limits.operationTimeoutMs);
    });
    const execute = async (): Promise<T> => {
      const connectionString = await this.credentials.resolve(ref);
      if (expired) throw new SourceTimeout();
      credential = connectionString;
      client = new Client({ connectionString, connectionTimeoutMillis: this.limits.operationTimeoutMs,
        statement_timeout: this.limits.statementTimeoutMs, query_timeout: this.limits.operationTimeoutMs,
        application_name: 'opintel-sidecar-connector' });
      // Socket errors are consumed here and are reported safely by the operation.
      client.on('error', () => { expired = true; });
      await client.connect();
      if (expired) throw new SourceTimeout();
      const identity = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      backendPid = identity.rows[0]?.pid;
      if (expired) throw new SourceCancelled();
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
    try { return await Promise.race([execute(), deadline, cancelled]); }
    finally {
      const needsCancel = expired || signal?.aborted;
      expired = true;
      if (abortOperation !== undefined) signal?.removeEventListener('abort', abortOperation);
      // A bounded control connection uses the same credential to cancel only
      // this scope's backend. It is never used for customer queries.
      if (needsCancel && credential !== undefined && backendPid !== undefined) {
        const control = new Client({ connectionString: credential, connectionTimeoutMillis: 1000, statement_timeout: 1000, query_timeout: 1000, application_name: 'opintel-sidecar-cancel' });
        control.on('error', () => {});
        try {
          await control.connect();
          await control.query('SELECT pg_cancel_backend($1)', [backendPid]);
        } catch { /* Closing the source connection and its statement timeout remain the fallback. */ }
        finally { await control.end().catch(() => {}); }
      }
      if (timer !== undefined) clearTimeout(timer);
      try { await client?.end(); }
      finally {
        const remaining = (this.active.get(sourceKey) ?? 1) - 1;
        if (remaining === 0) this.active.delete(sourceKey); else this.active.set(sourceKey, remaining);
      }
    }
  }
}
