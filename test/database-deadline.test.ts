import { Client } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import { DatabaseOwner, databasePhase, observeReset } from '../scripts/testing/database-deadline.js';

it('cancels an active query on abort and confirms its backend is gone before continuing', async () => {
  const owner = new DatabaseOwner();
  owner.deadline = () => performance.now() + 30_000;
  const abort = new AbortController();
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  let backend = 0;
  let announceStarted!: () => void;
  const started = new Promise<void>(resolve => { announceStarted = resolve; });
  const work = databasePhase(owner, abort.signal, async () => {
    await client.connect();
    await client.query('BEGIN');
    backend = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    const query = client.query('SELECT pg_sleep(30)');
    announceStarted();
    return query;
  });
  const refused = expect(work).rejects.toMatchObject({ code: '57014' });
  await started;
  // Allow the query to reach the server; the 30s statement timeout cannot
  // explain this cancellation. Abort is the positive control here.
  await delay(100);
  abort.abort();
  await refused;
  const observer = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await observer.connect();
  try { expect((await observer.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [backend])).rowCount).toBe(0); }
  finally { await observer.end(); }
  await expect(databasePhase(owner, undefined, () => client.query('SELECT 1'))).rejects.toThrow('Database work refused after its test deadline');
});

it('server statement timeout uses the remaining phase budget and preserves the native code', async () => {
  const owner = new DatabaseOwner();
  const deadline = performance.now() + 1_300;
  owner.deadline = () => deadline;
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await expect(databasePhase(owner, undefined, async () => {
    await client.connect();
    return client.query('SELECT pg_sleep(30)');
  })).rejects.toMatchObject({ code: '57014' });
});

it('preserves a tighter connection statement budget and restores the reset lock setting', async () => {
  const owner = new DatabaseOwner();
  owner.deadline = () => performance.now() + 30_000;
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL, statement_timeout: 500 });
  await databasePhase(owner, undefined, async () => {
    await client.connect();
    try {
      await client.query("SET lock_timeout='250ms'");
      await client.query('CREATE TEMP TABLE deadline_setting(id integer)');
      await client.query('TRUNCATE TABLE deadline_setting');
      expect((await client.query<{ lock_timeout: string }>('SHOW lock_timeout')).rows[0]!.lock_timeout).toBe('250ms');
      expect((await client.query<{ statement_timeout: string }>('SHOW statement_timeout')).rows[0]!.statement_timeout).toBe('500ms');
    } finally { await client.end(); }
  });
});


it('reset diagnostics retain the blocker after timeout and strip its SQL literals', async()=>{
  const client=new Client({connectionString:process.env.TEST_DATABASE_URL});
  const blocker=new Client({connectionString:process.env.TEST_DATABASE_URL,application_name:'deadline-positive-blocker'});
  // Transaction-scoped advisory locks exercise the same pg_blocking_pids
  // path without creating a committed relation that a timed-out test can leak.
  const lock=parseInt(crypto.randomUUID().slice(0,8),16);
  let clientConnected=false,blockerConnected=false;
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
    await client.connect();clientConnected=true;
    await blocker.connect();blockerConnected=true;
    await client.query('BEGIN');
    await blocker.query('BEGIN');
    await blocker.query(`SELECT pg_advisory_xact_lock(${lock}), 'RESET_LITERAL_SENTINEL'`);
    await client.query("SET lock_timeout='400ms'");
    const observer=await observeReset(client as Client & {processID:number;connectionParameters:import('pg').ClientConfig});
    try{await expect(client.query('SELECT pg_advisory_xact_lock($1)',[lock])).rejects.toMatchObject({code:'55P03'});}
    finally{await observer.finish(true);}
    const line=log.mock.calls.map(call=>String(call[0])).find(value=>value.includes('database.reset_blockers'))!;
    expect(line).toBeDefined();expect(line).not.toContain('RESET_LITERAL_SENTINEL');
    const record=JSON.parse(line) as {lastObserved:{application_name:string;query:string;state:string;pid:number;backend_start:string;query_start:string}[];afterTimeout:unknown[]};
    expect(record.lastObserved).toHaveLength(1);
    expect(record.lastObserved[0]).toMatchObject({application_name:'deadline-positive-blocker',state:'idle in transaction'});
    expect(record.lastObserved[0]!.query).toContain('SELECT');
    expect(record.afterTimeout).toHaveLength(0);
  }finally{
    log.mockRestore();
    // Always attempt both cleanups, including failed connection/setup/assertion
    // paths. ROLLBACK is permitted by the deadline guard after abort; closing
    // either socket also releases its transaction-scoped locks.
    const cleanup=await Promise.allSettled([{session:client,connected:clientConnected},{session:blocker,connected:blockerConnected}].map(async ({session,connected})=>{
      try{if(connected)await session.query('ROLLBACK');}finally{await session.end();}
    }));
    const failures=cleanup.flatMap(result=>result.status==='rejected'?[result.reason as unknown]:[]);
    if(failures.length)throw new AggregateError(failures,'Diagnostic transaction cleanup failed.');
  }
});
