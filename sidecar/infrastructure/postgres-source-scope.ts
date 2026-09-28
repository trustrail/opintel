import { Client,types } from 'pg';
import { randomUUID } from 'node:crypto';
import type { SourceCredentialResolver } from '../application/source-connector.js';
import type { SecretRef } from '../../src/platform/secrets/types.js';

export interface SourceSession {
  query(sql: string, values?: unknown[]): Promise<unknown[]>;
}
export interface SourceLimits {
  maxConnectionsPerSource: number;
  statementTimeoutMs: number;
  operationTimeoutMs: number;
}
export class SourceBusy extends Error {}
export class SourceTimeout extends Error {
  constructor() {
    super('Source operation exceeded its deadline.');
    this.name = 'SourceTimeout';
  }
}
/** Only the operation deadline uses this clock. Driver/server timeouts remain
 * real and are covered by the isolated Postgres performance tests. */
export interface SourceDeadlineClock {
  after(milliseconds: number, expire: () => void): () => void;
}
const realDeadlineClock: SourceDeadlineClock = {
  after(milliseconds, expire) {
    const timer = setTimeout(expire, milliseconds);
    return () => clearTimeout(timer);
  },
};
export class SourceCancelled extends Error {}

/** Customer-source scope. Separate from Opintel's handwritten metadata scopes.
 * Share one instance across the sidecar host to enforce its per-source ceiling. */
export class PostgresSourceScope {
  private readonly active = new Map<string, number>();
  constructor(private readonly credentials: SourceCredentialResolver, private readonly limits: SourceLimits, private readonly deadlineClock: SourceDeadlineClock = realDeadlineClock) {
    for (const value of Object.values(limits)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new Error('Source limits must be positive bounded integers.');
    }
  }

  /** Lease for a native scanner: shares the connector's per-source ceiling.
   * The scanner is configured for one connection, and a bounded cancellation
   * connection targets only this lease's unique application name. */
  async external<T>(sourceKey:string,ref:SecretRef,work:(connection:string,signal:AbortSignal)=>Promise<T>,parent:AbortSignal):Promise<T>{
    const controller=new AbortController(),abort=()=>controller.abort();let timedOut=false;
    const signal=controller.signal;
    if(parent.aborted)throw new SourceCancelled();
    const count=this.active.get(sourceKey)??0;if(count>=this.limits.maxConnectionsPerSource)throw new SourceBusy();
    this.active.set(sourceKey,count+1);
    parent.addEventListener('abort',abort,{once:true});
    const stop=this.deadlineClock.after(this.limits.operationTimeoutMs,()=>{timedOut=true;abort();});
    const tag='opintel-scan-'+randomUUID();let cancellation:Promise<void>|undefined;let cancel:(()=>void)|undefined;
    try{
      let detach=()=>{};
      const interrupted=new Promise<never>((_resolve,reject)=>{const fail=()=>reject(timedOut?new SourceTimeout():new SourceCancelled());signal.addEventListener('abort',fail,{once:true});detach=()=>signal.removeEventListener('abort',fail);if(signal.aborted)fail();});
      let credential:string;
      try{credential=await Promise.race([this.credentials.resolve(ref),interrupted]);}finally{detach();}
      if(signal.aborted)throw new SourceCancelled();
      const options=`-c statement_timeout=${this.limits.statementTimeoutMs} -c timezone=UTC -c datestyle=ISO,YMD`;
      let connection:string;
      try{const url=new URL(credential);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error();url.searchParams.set('options',options);url.searchParams.set('application_name',tag);url.searchParams.set('connect_timeout','1');connection=url.toString().replaceAll('+','%20');}
      catch{connection=credential+` options='${options}' application_name='${tag}' connect_timeout=1`;}
      cancel=()=>{cancellation=(async()=>{const control=new Client({connectionString:credential,connectionTimeoutMillis:1000,statement_timeout:1000,query_timeout:1000});control.on('error',()=>{});try{await control.connect();await control.query('SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE application_name=$1',[tag]);}catch{/* Scanner timeout and detach are still mandatory. */}finally{await control.end().catch(()=>{});}})();};
      signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)throw new SourceCancelled();
      try{const result=await work(connection,signal);if(signal.aborted)throw new SourceCancelled();return result;}catch(error){if(timedOut)throw new SourceTimeout();throw error;}
    }finally{stop();parent.removeEventListener('abort',abort);if(cancel)signal.removeEventListener('abort',cancel);await cancellation;const left=(this.active.get(sourceKey)??1)-1;if(left)this.active.set(sourceKey,left);else this.active.delete(sourceKey);}
  }

  async run<T>(sourceKey: string, ref: SecretRef, work: (session: SourceSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
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
    let clearDeadline: (() => void) | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      clearDeadline = this.deadlineClock.after(this.limits.operationTimeoutMs, () => { expired = true; reject(new SourceTimeout()); });
    });
    const execute = async (): Promise<T> => {
      const connectionString = await this.credentials.resolve(ref);
      if (expired) throw new SourceTimeout();
      credential = connectionString;
      client = new Client({ connectionString, connectionTimeoutMillis: this.limits.operationTimeoutMs,
        statement_timeout: this.limits.statementTimeoutMs, query_timeout: this.limits.operationTimeoutMs,
        types:{getTypeParser:(oid,format)=>[1082,1114,1184].includes(oid)?(value:string)=>value:types.getTypeParser(oid,format)},
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
    const running=execute();
    try { return await Promise.race([running, deadline, cancelled]); }
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
      clearDeadline?.();
      try { await client?.end(); }
      finally {
        const remaining = (this.active.get(sourceKey) ?? 1) - 1;
        if (remaining === 0) this.active.delete(sourceKey); else this.active.set(sourceKey, remaining);
      }
    }
  }
}
