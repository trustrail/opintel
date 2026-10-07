import { Client } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { DatabaseOwner, databasePhase } from '../scripts/testing/database-deadline.js';

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
