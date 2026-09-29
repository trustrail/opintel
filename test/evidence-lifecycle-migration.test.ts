import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {it,expect} from 'vitest';
import {policyFixture} from './fixtures/policy-version/fixture.js';
// Owner access is confined to rollback-only migration/clock fixtures.
it('052 down/up round-trips twice before irreversible lifecycle work',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');await db.query('TRUNCATE query_run,evidence_redaction,evidence_rollup CASCADE');
  for(let i=0;i<2;i++){await db.query(await readFile('migrations/052_evidence_lifecycle.down.sql','utf8'));await db.query(await readFile('migrations/052_evidence_lifecycle.up.sql','utf8'));}
  const {rows}=await db.query("SELECT has_table_privilege('opintel_app','evidence_rollup','UPDATE') AS update,has_table_privilege('opintel_app','evidence_redaction','DELETE') AS delete");expect(rows).toEqual([{update:false,delete:false}]);
 }finally{await db.query('ROLLBACK');await db.end();}
});
it('Q-025: unset windows retain evidence, rollups honour their creation floor, old incomplete headers survive',async()=>{
 const f=await policyFixture(0),db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');
  const {rows}=await db.query<{id:string;at:string}>("INSERT INTO query_run(project_id,pool_id,key_prefix,mode,request,versions,started_at) SELECT $1,$2,'test','query','SELECT 1','{\"policy\":1,\"catalog\":1,\"vocabulary\":1,\"tokenKeyVersionSelected\":null}',clock_timestamp()-interval '10 days' FROM generate_series(1,2) RETURNING id,started_at::text AS at",[f.ctx.projectId,f.pool]);const r=rows[0]!;
  await db.query("INSERT INTO run_completion(run_id,started_at,outcome,completed_at) VALUES($1,$2,'{\"kind\":\"answered\",\"rowCount\":1,\"truncated\":false}',$2)",[r.id,r.at]);
  expect((await db.query('SELECT retain_evidence($1) AS n',[f.ctx.projectId])).rows).toEqual([{n:0}]);
  await db.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{fullRetentionDays:3}}]);
  expect((await db.query('SELECT retain_evidence($1) AS n',[f.ctx.projectId])).rows).toEqual([{n:1}]);
  // Simulate time passing only in the owner fixture, not through application grants.
  await db.query("UPDATE evidence_rollup SET created_at=clock_timestamp()-interval '2 days' WHERE id=$1",[r.id]);
  await db.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{fullRetentionDays:1,rollupRetentionDays:1}}]);
  expect((await db.query('SELECT retain_evidence($1) AS n',[f.ctx.projectId])).rows).toEqual([{n:0}]);
  await db.query("UPDATE evidence_rollup SET created_at=clock_timestamp()-interval '4 days' WHERE id=$1",[r.id]);
  await db.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{fullRetentionDays:1}}]);
  expect((await db.query('SELECT retain_evidence($1) AS n',[f.ctx.projectId])).rows).toEqual([{n:0}]);
  await db.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{fullRetentionDays:1,rollupRetentionDays:1}}]);
  expect((await db.query('SELECT retain_evidence($1) AS n',[f.ctx.projectId])).rows).toEqual([{n:1}]);
  expect((await db.query('SELECT id FROM query_run WHERE project_id=$1',[f.ctx.projectId])).rows).toEqual([{id:rows[1]!.id}]);
 }finally{await db.query('ROLLBACK');await db.end();}
});
it('Q-027: the database rejects sampled-away failures and refuses downgrade after redaction',async()=>{
 const f=await policyFixture(0),db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');const {rows:[r]}=await db.query("INSERT INTO query_run(project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,'test','query',NULL,'{\"policy\":1,\"catalog\":1,\"vocabulary\":1,\"tokenKeyVersionSelected\":null}',now()) RETURNING id,started_at::text AS started_at",[f.ctx.projectId,f.pool]);
  await db.query('SAVEPOINT failed');await expect(db.query("INSERT INTO run_completion(run_id,started_at,outcome,detail_captured,completed_at) VALUES($1,$2,'{\"kind\":\"failed\",\"code\":\"dependency_unavailable\",\"retryable\":true}',false,now())",[r.id,r.started_at])).rejects.toMatchObject({code:'23514'});await db.query('ROLLBACK TO SAVEPOINT failed');
  await expect(db.query(await readFile('migrations/052_evidence_lifecycle.down.sql','utf8'))).rejects.toThrow('downgrade would destroy evidence');
 }finally{await db.query('ROLLBACK');await db.end();}
});

it('Q-025: a failure removing full evidence rolls back the rollup and preserves the entire run',async()=>{
 const f=await policyFixture(0),db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');await db.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{fullRetentionDays:1,rollupRetentionDays:1}}]);
  const {rows:[r]}=await db.query("INSERT INTO query_run(project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,'test','query','SELECT 1','{\"policy\":1,\"catalog\":1,\"vocabulary\":1,\"tokenKeyVersionSelected\":null}',clock_timestamp()-interval '2 days') RETURNING id,started_at::text AS started_at",[f.ctx.projectId,f.pool]);
  await db.query("INSERT INTO run_completion(run_id,started_at,outcome,completed_at) VALUES($1,$2,'{\"kind\":\"answered\",\"rowCount\":1,\"truncated\":false}',now())",[r.id,r.started_at]);
  await db.query("CREATE FUNCTION pg_temp.refuse_evidence_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected retention failure'; END $$; CREATE TRIGGER test_retention_failure BEFORE DELETE ON run_completion FOR EACH ROW EXECUTE FUNCTION pg_temp.refuse_evidence_delete()");
  await db.query('SAVEPOINT retain');await expect(db.query('SELECT retain_evidence($1)',[f.ctx.projectId])).rejects.toThrow('Injected retention failure');await db.query('ROLLBACK TO SAVEPOINT retain');
  expect((await db.query('SELECT id FROM query_run WHERE id=$1',[r.id])).rows).toHaveLength(1);expect((await db.query('SELECT run_id FROM run_completion WHERE run_id=$1',[r.id])).rows).toHaveLength(1);expect((await db.query('SELECT id FROM evidence_rollup WHERE id=$1',[r.id])).rows).toHaveLength(0);
 }finally{await db.query('ROLLBACK');await db.end();}
});
