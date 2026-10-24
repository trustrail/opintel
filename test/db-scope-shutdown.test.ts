import {Client,type Pool} from 'pg';
import {expect,it,vi} from 'vitest';

const captured=vi.hoisted(()=>({pools:[] as Pool[]}));
vi.mock('pg',async original=>{
 const pg=await original<typeof import('pg')>();
 return {...pg,Pool:class extends pg.Pool {
  constructor(...args:ConstructorParameters<typeof pg.Pool>){super(...args);captured.pools.push(this);}
 }};
});

it('logs a terminated idle client without throwing and drains the private pool at shutdown',async()=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const {withPlatform}=await import('../src/platform/db/scope.js');
 const pool=captured.pools[0];
 if(!pool)throw new Error('Scope pool was not captured.');
 const administrator=new Client({connectionString:process.env.TEST_DATABASE_URL});
 try{
  const [backend]=await withPlatform(tx=>tx.query<{pid:number}>('SELECT pg_backend_pid() AS pid'));
  if(!backend)throw new Error('Scope did not return its backend.');
  expect(pool.idleCount).toBe(1);
  await administrator.connect();
  await administrator.query('SELECT pg_terminate_backend($1)',[backend.pid]);
  await vi.waitFor(()=>expect(warning).toHaveBeenCalledWith({event:'db.idle_client_error',message:'An idle database connection closed unexpectedly.'}));
  expect(pool.totalCount).toBe(0);
  // A subsequent scoped acquisition still works; the failure did not poison it.
  await withPlatform(tx=>tx.query('SELECT 1'));
  expect(pool.idleCount).toBe(1);
  await pool.end();
  expect(pool.totalCount).toBe(0);
  expect(pool.idleCount).toBe(0);
 }finally{
  await administrator.end();
  if(!pool.ending)await pool.end();
  warning.mockRestore();
 }
});
