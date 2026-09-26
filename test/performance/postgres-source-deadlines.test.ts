import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { PostgresSourceScope } from '../../sidecar/index.js';
const suffix=randomUUID().replaceAll('-',''),schema=`deadline_${suffix}`,role=`deadline_${suffix}`,password=randomUUID();
const quote=(name:string)=>`"${name.replaceAll('"','""')}"`;
const envelope={credentialRef:'secret://test/customer'};
let sourceUrl:string;
async function fixture<T>(work:(client:Client)=>Promise<T>):Promise<T>{
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
 try{return await work(client);}finally{await client.end();}
}
beforeAll(async()=>{
 await fixture(async db=>{
  await db.query(`CREATE ROLE ${quote(role)} LOGIN PASSWORD '${password}'`);
  await db.query(`CREATE SCHEMA ${quote(schema)}; CREATE TABLE ${quote(schema)}.t0(id integer,label text)`);
  await db.query(`GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(role)}; GRANT SELECT ON ALL TABLES IN SCHEMA ${quote(schema)} TO ${quote(role)}`);
 });
 const url=new URL(process.env.TEST_DATABASE_URL!);url.username=role;url.password=password;sourceUrl=url.toString();
},30000);
afterAll(async()=>{await fixture(async db=>{
 await db.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);await db.query(`DROP ROLE IF EXISTS ${quote(role)}`);
});},30000);
// These retain the real timers and budgets. Functional deadline logic uses an
// injected clock; PostgreSQL statement cancellation needs this real source.
describe('C.4 real Postgres deadlines in isolation',()=>{
  it('C.4: scope enforces read-only, statement timeout and closes every connection', async () => {
    const scope = new PostgresSourceScope({ resolve: async () => sourceUrl }, { maxConnectionsPerSource: 1, statementTimeoutMs: 50, operationTimeoutMs: 1000 });
    const { SecretRef } = await import('../../src/platform/secrets/types.js');
    const ref = SecretRef(envelope.credentialRef);
    expect(await scope.run('test', ref, (session) => session.query('SHOW transaction_read_only'))).toEqual([{ transaction_read_only: 'on' }]);
    await expect(scope.run('test', ref, (session) => session.query('SELECT pg_sleep(1)'))).rejects.toMatchObject({ code: '57014' });
    await expect(scope.run('test', ref, (session) => session.query(`INSERT INTO ${quote(schema)}.t0 VALUES (9,'write')`))).rejects.toMatchObject({ code: '25006' });
    expect(await fixture(async (db) => (await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1", [role])).rows)).toEqual([{ count: 0 }]);
  });

  it('C.4: bounds total wall time, refuses excess connections, and releases the slot', async () => {
    const { SecretRef } = await import('../../src/platform/secrets/types.js');
    const scope = new PostgresSourceScope({ resolve: async () => sourceUrl }, { maxConnectionsPerSource: 1, statementTimeoutMs: 5000, operationTimeoutMs: 100 });
    const ref = SecretRef(envelope.credentialRef);
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const running = scope.run('test', ref, async (session) => { started(); return session.query('SELECT pg_sleep(5)'); });
    const finished = expect(running).rejects.toThrow();
    await ready;
    await expect(scope.run('test', ref, async () => {})).rejects.toThrow();
    await finished;
    expect(await scope.run('test', ref, (session) => session.query('SELECT 1 AS ok'))).toEqual([{ ok: 1 }]);
  });
});
