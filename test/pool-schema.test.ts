import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant, type Tx } from '../src/platform/db/scope.js';
import { ProjectId, UserId } from '../src/shared/kernel/index.js';
const projectId=ProjectId(randomUUID());const other=ProjectId(randomUUID());const userId=UserId(randomUUID());const pool=randomUUID();const source=randomUUID();
const scope=<T>(work:(tx:Tx)=>Promise<T>)=>withTenant({projectId,userId},work);
const digest=(n:number)=>Buffer.alloc(32,n);
const integration=process.env.DATABASE_URL===undefined&&process.env.REQUIRE_DB_TESTS!=='1'?describe.skip:describe;
integration('pool schema with real Postgres',()=>{
 resetDatabaseBeforeEach('company', 'user_account');
 beforeEach(async()=>{
  await withPlatform(async tx=>{
   const [industry]=await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
   const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Pool tests','eu-west-1') RETURNING id");
   await tx.query("INSERT INTO user_account(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",[userId,`${userId}@example.com`]);
   await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$3,$4,'Pool A','eu-west-1'),($2,$3,$4,'Pool B','eu-west-1')",[projectId,other,company!.id,industry!.id]);
  });
  await scope(async tx=>{
   await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,projectId]);
   await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref) VALUES($1,$2,'Warehouse','warehouse','postgres','secret://test/warehouse')",[source,projectId]);
   await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[pool,source,projectId]);
  });
 });
 const insert=(n:number,state='current',grace:string|null=null)=>scope(tx=>tx.query(`INSERT INTO pool_key(pool_id,project_id,key_hash,key_prefix,state,grace_until,created_at,created_by)
 VALUES($1,$2,$3,'opk_live_example',$4,$5,'2026-01-01',$6) RETURNING id`,[pool,projectId,digest(n),state,grace,userId]));
 it('I-001: enforces concurrent current-key uniqueness and one retiring key with a grace window',async()=>{
  const outcomes=await Promise.allSettled([insert(1),insert(2)]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(outcomes.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'23505'}});
  await insert(3,'retiring','2026-01-02');
  await expect(insert(4,'retiring','2026-01-03')).rejects.toMatchObject({code:'23505'});
  await scope(tx=>tx.query("UPDATE pool_key SET state='expired' WHERE state='retiring'"));
  await insert(4,'retiring','2026-01-03');
  await expect(insert(5,'retiring')).rejects.toMatchObject({code:'23514'});
  await expect(insert(6,'current','2026-01-03')).rejects.toMatchObject({code:'23514'});
  await expect(insert(7,'expired','2025-01-01')).rejects.toMatchObject({code:'23514'});
  await expect(scope(tx=>tx.query("INSERT INTO pool(project_id,name) VALUES($1,'REPORTING')",[projectId]))).rejects.toMatchObject({code:'23505'});
  for(const name of ['', '   ', 'x'.repeat(81), 'x'.repeat(80)+' ']) await expect(scope(tx=>tx.query('INSERT INTO pool(project_id,name) VALUES($1,$2)',[projectId,name]))).rejects.toMatchObject({code:'23514'});
 });
 it('I-002: only a SHA-256-sized digest and incomplete display prefix can be persisted',async()=>{
  const credential='opk_live_'+'A'.repeat(22);
  await expect(scope(tx=>tx.query("INSERT INTO pool_key(pool_id,project_id,key_hash,key_prefix,state,created_by) VALUES($1,$2,$3,'opk_live_A','current',$4)",[pool,projectId,Buffer.from(credential),userId]))).rejects.toMatchObject({code:'23514'});
  await expect(scope(tx=>tx.query("INSERT INTO pool_key(pool_id,project_id,key_hash,key_prefix,state,created_by) VALUES($1,$2,$3,$4,'current',$5)",[pool,projectId,digest(8),credential,userId]))).rejects.toMatchObject({code:'23514'});
  await insert(8);
  const [stored]=await scope(tx=>tx.query<{key_hash:Buffer;key_prefix:string}>('SELECT key_hash,key_prefix FROM pool_key'));
  expect(stored).toEqual({key_hash:digest(8),key_prefix:'opk_live_example'});
  const columns=await withPlatform(tx=>tx.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pool_key' ORDER BY ordinal_position"));
  // Inspect catalogue attributes regardless of the platform role's data grants.
  const names=await withPlatform(tx=>tx.query<{attname:string}>("SELECT attname FROM pg_attribute WHERE attrelid='public.pool_key'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum"));
  expect(names.map(row=>row.attname)).toEqual(['id','pool_id','project_id','key_hash','key_prefix','state','grace_until','created_at','created_by']);
  expect(columns).toEqual([]); // Platform scope has no tenant data privileges.
 });
 it('isolates pools, keys and bindings and rejects forged cross-project references',async()=>{
  await insert(1);
  const ctx={projectId:other,userId};const second=randomUUID();
  for(const table of ['pool','pool_key','pool_source_binding']){
   expect(await withTenant(ctx,tx=>tx.query(`SELECT * FROM ${table}`))).toEqual([]);
   expect(await withTenant(ctx,tx=>tx.query(`DELETE FROM ${table} RETURNING *`))).toEqual([]);
  }
  expect(await withTenant(ctx,tx=>tx.query("UPDATE pool SET name='Changed' WHERE id=$1 RETURNING id",[pool]))).toEqual([]);
  for(const table of ['pool','pool_key','pool_source_binding'])expect(await scope(tx=>tx.query(`SELECT * FROM ${table}`))).toHaveLength(1);
  await expect(withTenant(ctx,tx=>tx.query("INSERT INTO pool(project_id,name) VALUES($1,'Forged')",[projectId]))).rejects.toMatchObject({code:'42501'});
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[second,other]));
  await expect(withTenant(ctx,tx=>tx.query("INSERT INTO pool_key(pool_id,project_id,key_hash,key_prefix,state,created_by) VALUES($1,$2,$3,'opk_live_a','revoked',$4)",[pool,other,digest(9),userId]))).rejects.toMatchObject({code:'23503'});
  await expect(withTenant(ctx,tx=>tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[second,source,other]))).rejects.toMatchObject({code:'23503'});
 });
});
