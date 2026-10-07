import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { Client, Pool, type ClientConfig, type PoolClient } from 'pg';

// Test infrastructure only. The production scopes, roles and transaction
// ownership are unchanged. Never emit SQL, parameters or connection material.
interface NativeClient extends Client { processID: number; connectionParameters: ClientConfig }
interface Lease { client: NativeClient; tag: string; pending: Set<Promise<unknown>>; queue: Promise<unknown>; birth?: string; pool?: Pool; retiring?: boolean }
interface GuardState {
  rawQuery: typeof Client.prototype.query;
  rawConnect: typeof Client.prototype.connect;
  rawPoolConnect: typeof Pool.prototype.connect;
  storage: AsyncLocalStorage<DatabaseOwner>;
  leases: WeakMap<Client, Lease>;
  controls: WeakSet<Client>;
  installed: boolean;
  now: () => number;
}
// Vitest imports its runner and test modules through separate module graphs.
// Both must operate on the same pg patch and ownership context.
const key = Symbol.for('opintel.test.database-deadlines');
const holder = Client as typeof Client & { [key]?: GuardState };
const state = holder[key] ??= {
  rawQuery: Client.prototype.query, rawConnect: Client.prototype.connect, rawPoolConnect: Pool.prototype.connect,
  storage: new AsyncLocalStorage<DatabaseOwner>(), leases: new WeakMap<Client, Lease>(),
  controls: new WeakSet<Client>(), installed: false, now: performance.now.bind(performance),
};
const { rawQuery, rawConnect, rawPoolConnect, storage, leases, controls } = state;
const now = state.now;
function diagnostic(event: string, backend?: number, error?: unknown): void {
  const directory = process.env.OPINTEL_TEST_DATABASE_DIAGNOSTICS;
  if (directory) appendFileSync(join(directory, `worker-${process.pid}.jsonl`), JSON.stringify({ event, backend, time: now(), ...(error === undefined ? {} : { privateException: inspect(error, { depth: 5 }) }) }) + '\n', { mode: 0o600 });
}

export const databaseStopMessage = 'Database test run stopped: cleanup could not be confirmed or a reset was blocked. No further tests may use this database.';

export function stopDatabaseRun(): never {
  const file = process.env.OPINTEL_TEST_DATABASE_STOP;
  if (!file) throw new Error('Database stop marker was not configured.');
  writeFileSync(file, databaseStopMessage + '\n', { mode: 0o600 });
  throw new Error(databaseStopMessage);
}

export function databaseRunStopped(): boolean {
  const file = process.env.OPINTEL_TEST_DATABASE_STOP;
  return file !== undefined && existsSync(file);
}

function native(client: Client): NativeClient { return client as NativeClient; }
function sqlText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && 'text' in input && typeof input.text === 'string') return input.text;
  throw new Error('Database deadline guard requires a SQL string or QueryConfig.');
}
function code(error: unknown): unknown { return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined; }
function invoke(client: Client, args: unknown[]): Promise<unknown> {
  return Promise.resolve(Reflect.apply(rawQuery, client, args) as unknown);
}

export class DatabaseOwner {
  readonly connections = new Set<Lease>();
  aborted = false;
  private cleanup?: Promise<void>;
  private blockedReset = false;
  budgetFailure?: string;
  // Supplied by the runner: the actual current hook/body deadline, including
  // explicit overrides. A fixed per-query timeout would restart the budget.
  deadline = () => Number.POSITIVE_INFINITY;

  abort(): void { this.aborted = true; }
  hasPendingWork(): boolean { return [...this.connections].some(lease => lease.pending.size > 0); }

  async drain(): Promise<void> {
    if (!this.aborted) return;
    this.cleanup ??= this.clean();
    await this.cleanup;
    if (this.blockedReset) stopDatabaseRun();
  }

  private async clean(): Promise<void> {
    // All acquired sessions must disappear, including an idle transaction and
    // a client whose application promise has already rejected. PID + backend
    // birth prevents cancelling a recycled PID. Existing application names
    // are preserved because source cancellation can depend on them.
    const pending = Promise.allSettled([...this.connections].map(async lease => {
      const client = lease.client;
      lease.retiring = true;
      if (!client.processID) throw new Error('Database backend identity was not established.');
      const control = new Client({ ...client.connectionParameters,
        // pg intentionally makes this property non-enumerable.
        password: client.connectionParameters.password,
        application_name: 'opintel-test-cleanup', connectionTimeoutMillis: 1_000,
        statement_timeout: 1_000, query_timeout: 1_500 });
      controls.add(control);
      control.on('error', () => {});
      client.on('error', () => {});
      try {
        diagnostic('cleanup.connect', client.processID);
        await control.connect();
        diagnostic('cleanup.connected', client.processID);
        if (!lease.birth) {
          await Promise.race([lease.queue.catch(() => undefined), delay(1_000)]);
          if (!lease.birth) throw new Error('Database backend birth was not established.');
        }
        const identity = [client.processID, lease.birth];
        diagnostic('cleanup.cancel', client.processID);
        await control.query('SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz AND state=\'active\'', identity);
        // Let the scope's own catch roll back and release first. The barrier
        // sits outside Vitest's timeout wrapper and is awaited by the runner.
        await Promise.race([Promise.allSettled([...lease.pending]), delay(1_000)]);
        diagnostic('cleanup.settled', client.processID);
        const state = await control.query<{ state: string }>('SELECT state FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz', identity);
        if (state.rows[0]?.state !== 'active') {
          await Promise.race([invoke(client, ['ROLLBACK']).catch(() => undefined), delay(500)]);
          // pg-pool must forget a retired session. Ending an idle Client alone
          // leaves it in the pool and makes the next test borrow a dead client.
          if (lease.pool) (lease.pool as Pool & { _remove(client: Client): void })._remove(client);
          void client.end().catch(() => {});
        }
        // Connection close/rollback requests are not proof of completion.
        // Terminate an owned backend that did not finish graceful cleanup.
        await control.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz', identity);
        diagnostic('cleanup.verify', client.processID);
        const until = now() + 2_000;
        do {
          const remaining = await control.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz', identity);
          if (remaining.rowCount === 0) { diagnostic('cleanup.confirmed', client.processID); return; }
          await delay(25);
        } while (now() < until);
        throw new Error('Database backend cleanup could not be confirmed.');
      } catch (error) { diagnostic('cleanup.failed', client.processID, error); throw error;
      } finally { await Promise.race([control.end(), delay(500).then(() => { throw new Error('Cleanup control connection did not close.'); })]); }
    }));
    const results = await Promise.race([pending, delay(5_000).then(() => undefined)]);
    if (!results) { diagnostic('cleanup.barrier_expired'); stopDatabaseRun(); }
    if (results.some(result => result.status === 'rejected')) stopDatabaseRun();
  }

  query(client: Client, args: unknown[]): Promise<unknown> {
    const sql = sqlText(args[0]);
    const rollback = /^\s*ROLLBACK\b/iu.test(sql);
    if ((this.aborted || databaseRunStopped()) && !rollback) return Promise.reject(new Error('Database work refused after its test deadline.'));
    let lease = leases.get(client);
    if (!lease) return Promise.reject(new Error('Database connection was not registered by the test deadline guard.'));
    this.connections.add(lease);
    const reset = /^\s*TRUNCATE\b/iu.test(sql);
    const operation = lease.queue.catch(() => undefined).then(async () => {
      if (this.aborted && !rollback) throw new Error('Database work refused after its test deadline.');
      // Cleanup has its own bounded barrier outside the timed callback.
      // Deducting 1s here would silently turn a 5s test budget into 4s.
      if (!lease.birth) {
        const result = await invoke(client, ['SELECT backend_start::text AS birth FROM pg_stat_activity WHERE pid=pg_backend_pid()']) as { rows: { birth: string }[] };
        lease.birth = result.rows[0]?.birth;
        if (!lease.birth) throw new Error('Database backend birth was not established.');
      }
      let previousLock: string | undefined;
      if (!rollback) {
        const remaining = Math.floor(this.deadline() - now());
        if (remaining <= 0) {
          this.budgetFailure = 'Test database statement refused: its phase deadline has expired.';
          throw new Error(this.budgetFailure);
        }
        // Settings are issued below the scope adapter, never exposed through
        // Tx.query. Serialize settings and SQL together on each connection.
        const configured = native(client).connectionParameters.statement_timeout;
        const timeout = typeof configured === 'number' && configured > 0 ? Math.min(remaining, configured) : remaining;
        const milliseconds = Number.isFinite(timeout) ? String(timeout) : '0';
        if (reset) {
          const settings = await invoke(client, [
            "WITH previous AS MATERIALIZED (SELECT current_setting('lock_timeout') AS value) SELECT value AS previous,set_config('statement_timeout',$1,false),set_config('lock_timeout','1000',false) FROM previous",
            [milliseconds],
          ]) as { rows: { previous: string }[] };
          previousLock = settings.rows[0]?.previous;
        } else await invoke(client, ["SELECT set_config('statement_timeout',$1,false)", [milliseconds]]);
      }
      try {
        const result = await invoke(client, args);
        // The reset's cap must not replace an application's own lock timeout
        // or leak into the next pool checkout. Failed resets retire the client.
        if (previousLock !== undefined) await invoke(client, ["SELECT set_config('lock_timeout',$1,false)", [previousLock]]);
        return result;
      }
      catch (error) {
        if (reset && code(error) === '55P03') {
          this.blockedReset = true;
          this.abort();
          throw new Error('Database reset blocked for 1 second. The run will stop rather than queue further resets.');
        }
        throw error;
      }
    });
    lease.queue = operation;
    lease.pending.add(operation);
    void operation.then(() => lease!.pending.delete(operation), () => lease!.pending.delete(operation));
    return operation;
  }
}

export async function databasePhase<T>(owner: DatabaseOwner, signal: AbortSignal | undefined, work: () => PromiseLike<T> | T): Promise<T> {
  const abort = () => {
    owner.abort();
    // Start cancellation immediately, even while work has not rejected yet.
    // The outer barrier awaits the same promise and reports any failure.
    void owner.drain().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const result = await storage.run(owner, work);
    if (owner.budgetFailure) throw new Error(owner.budgetFailure);
    return result;
  }
  catch (error) {
    owner.abort();
    // Application boundaries may turn a harness refusal into a domain refusal.
    // Keep the test's real deadline diagnostic instead of a downstream parse
    // assertion that suggests the source itself failed.
    if (owner.budgetFailure) throw new Error(owner.budgetFailure, { cause: error });
    throw error;
  }
  finally {
    signal?.removeEventListener('abort', abort);
    await owner.drain();
  }
}

export function installDatabaseDeadlines(): void {
  if (state.installed) return;
  state.installed = true;
  Pool.prototype.connect = function(this: Pool, ...args: unknown[]): unknown {
    const register = (client: PoolClient): void => {
      const lease = leases.get(client);
      if (!lease) return;
      lease.pool = this;
      const release = client.release.bind(client);
      client.release = error => release(error || lease.retiring === true);
    };
    const callback = args[0];
    if (typeof callback === 'function') {
      return Reflect.apply(rawPoolConnect, this, [(error: unknown, client?: PoolClient) => {
        if (client) register(client);
        callback(error, client, client?.release);
      }]) as unknown;
    }
    const result = Reflect.apply(rawPoolConnect, this, args) as Promise<PoolClient>;
    return result.then(client => { register(client); return client; });
  } as typeof Pool.prototype.connect;
  Client.prototype.connect = function(this: Client, ...args: unknown[]): unknown {
    const owner = storage.getStore();
    if (owner && !controls.has(this)) {
      const client = native(this);
      const tag = client.connectionParameters.application_name || 'opintel-test-' + randomUUID();
      client.connectionParameters.application_name = tag;
      const lease: Lease = { client, tag, pending: new Set(), queue: Promise.resolve() };
      leases.set(this, lease);
      owner.connections.add(lease);
    }
    return Reflect.apply(rawConnect, this, args) as unknown;
  } as typeof Client.prototype.connect;
  Client.prototype.query = function(this: Client, ...args: unknown[]): unknown {
    const owner = storage.getStore();
    if (!owner || controls.has(this)) return Reflect.apply(rawQuery, this, args) as unknown;
    const callback = args.at(-1);
    if (typeof callback === 'function') {
      const promise = owner.query(this, args.slice(0, -1));
      void promise.then(value => callback(null, value), error => callback(error));
      return undefined;
    }
    return owner.query(this, args);
  } as typeof Client.prototype.query;
}
