import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { resetDatabaseBeforeEach } from '../../database-fixture.js';

const scenario = process.env.OPINTEL_DEADLINE_CONTROL_CASE;
const directory = process.env.OPINTEL_DEADLINE_CONTROL_DIRECTORY!;
const table = 'deadline_' + randomUUID().replaceAll('-', '');
let blocker: Client | undefined;
let backend = 0;

if (scenario === 'deadline') resetDatabaseBeforeEach('company');
if (scenario === 'lock') {
  beforeAll(async () => {
    blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await blocker.connect();
    // Record ownership before creating the relation: a failed/aborted child
    // may never reach afterAll, but the parent still has to remove its fixture.
    writeFileSync(resolve(directory, 'table'), table);
    await blocker.query(`CREATE TABLE "${table}"(id integer)`);
    await blocker.query('BEGIN');
    await blocker.query(`SELECT * FROM "${table}" FOR SHARE`);
  });
  afterAll(async () => {
    await blocker?.query('ROLLBACK');
    await blocker?.end();
    // Relation cleanup belongs to the parent after this intentional stop.
  });
}

it('root failure', async context => {
  context.onTestFailed(() => { writeFileSync(resolve(directory, 'root-aborted'), String(context.signal.aborted)); });
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');
  backend = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
  if (scenario === 'lock') await client.query(`TRUNCATE TABLE "${table}"`);
  else if (scenario === 'unconfirmed') {
    await client.end(); // Do not leave any real backend behind in this control.
    const native = client as Client & { connectionParameters: { port: number } };
    native.connectionParameters.port = 1; // Force the separate verifier to fail.
    throw new Error('Intentional cleanup verification failure.');
  } else {
    await client.query('SELECT 1 FROM company FOR SHARE');
    // The test deadline must clean an idle transaction too, not only SQL
    // currently executing. This deliberately outlives the Vitest callback.
    await delay(2_000);
    await expect(client.query('SELECT 1')).rejects.toThrow('Database work refused after its test deadline');
  }
}, scenario === 'lock' ? 3_000 : 1_500);

it('next test may run only after confirmed cleanup', async () => {
  writeFileSync(resolve(directory, 'next-ran'), 'yes');
  const observer = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await observer.connect();
  try { expect((await observer.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [backend])).rowCount).toBe(0); }
  finally { await observer.end(); }
});
