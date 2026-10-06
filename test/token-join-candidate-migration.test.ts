import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {migrationDatabase} from './fixtures/migration-database.js';
import {it,expect} from 'vitest';
import {withTenant} from '../src/platform/db/scope.js';
import {policyFixture} from './fixtures/policy-version/fixture.js';

const database=migrationDatabase();
it('JOIN-005: candidate migration up/down/up retains forced RLS and append-only tenant grants',async()=>{
 const db=database();
 try{
  await db.query('BEGIN');
  await db.query(await readFile('migrations/065_relationship_review.down.sql','utf8'));
  await db.query(await readFile('migrations/061_explain_join_candidates.down.sql','utf8'));
  const up=await readFile('migrations/060_token_join_candidates.up.sql','utf8'),down=await readFile('migrations/060_token_join_candidates.down.sql','utf8');
  for(let n=0;n<2;n++){await db.query(down);await db.query(up);}
  expect((await db.query(`SELECT relrowsecurity AS rls,relforcerowsecurity AS forced,
   has_table_privilege('opintel_app',oid,'SELECT') AS read,has_table_privilege('opintel_app',oid,'INSERT') AS insert,
   has_table_privilege('opintel_app',oid,'UPDATE') AS update,has_table_privilege('opintel_app',oid,'DELETE') AS delete
   FROM pg_class WHERE oid='token_join_candidate'::regclass`)).rows).toEqual([{rls:true,forced:true,read:true,insert:true,update:false,delete:false}]);
 }finally{await db.query('ROLLBACK');}
});

it('JOIN-005: tenants cannot read or insert another project’s candidate or mutate an attempt',async()=>{
 const own=await policyFixture(2),other=await policyFixture(2),id=randomUUID();
 await withTenant(other.ctx,async tx=>{
  const [run]=await tx.query<{at:string}>(`INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,versions,started_at)
   VALUES($1,$2,$3,'test','query','{"policy":1,"catalog":1,"vocabulary":1,"tokenKeyVersionSelected":null}',clock_timestamp()) RETURNING started_at::text AS at`,[id,other.ctx.projectId,other.pool]);
  await tx.query(`INSERT INTO token_join_candidate(id,run_id,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at)
   VALUES($1,$1,$2,$3,$4,$5,'left.id','right.id','observed-agent','SELECT 1',$6)`,[id,other.ctx.projectId,other.pool,...other.ids,run!.at]);
 });
 expect(await withTenant(own.ctx,tx=>tx.query('SELECT run_id FROM token_join_candidate WHERE run_id=$1',[id]))).toEqual([]);
 await expect(withTenant(own.ctx,tx=>tx.query(`INSERT INTO token_join_candidate(id,run_id,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at,operation) SELECT $1,$1,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at,operation FROM token_join_candidate WHERE run_id=$2`,[randomUUID(),id]))).resolves.toEqual([]);
 await expect(withTenant(own.ctx,tx=>tx.query(`INSERT INTO token_join_candidate(id,run_id,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at)
  VALUES($1,$1,$2,$3,$4,$5,'left.id','right.id','observed-agent','SELECT 1',clock_timestamp())`,[randomUUID(),other.ctx.projectId,other.pool,...other.ids]))).rejects.toMatchObject({code:'42501'});
 for(const statement of ['UPDATE token_join_candidate SET statement=statement','DELETE FROM token_join_candidate'])await expect(withTenant(other.ctx,tx=>tx.query(statement))).rejects.toMatchObject({code:'42501'});
});

it('JOIN-005: explain migration round-trips without attempts and refuses to destroy explain provenance',async()=>{
 const db=database();
 try{
  await db.query('BEGIN');
  await db.query(await readFile('migrations/065_relationship_review.down.sql','utf8'));
  const project=randomUUID(),pool=randomUUID(),source=randomUUID(),elements=[randomUUID(),randomUUID()];
  const company=(await db.query("INSERT INTO company(name,default_region) VALUES('Migration fixture','eu-west-1') RETURNING id")).rows[0] as {id:string};
  await db.query("INSERT INTO project(id,company_id,industry_id,name,region) SELECT $1,$2,id,'Migration fixture','eu-west-1' FROM industry LIMIT 1",[project,company.id]);
  await db.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Migration pool')",[pool,project]);
  await db.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,'Migration source','migration','postgres','secret://test/source','connected')",[source,project]);
  const object=(await db.query("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id",[project,source])).rows[0] as {id:string};
  await db.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type) SELECT id,$2,$3,'field_'||ordinal,'text','field_'||ordinal,'VARCHAR' FROM unnest($1::uuid[]) WITH ORDINALITY AS e(id,ordinal)",[elements,project,object.id]);
  const up=await readFile('migrations/061_explain_join_candidates.up.sql','utf8'),down=await readFile('migrations/061_explain_join_candidates.down.sql','utf8');
  await db.query(down);await db.query(up);
  await db.query(`INSERT INTO token_join_candidate(id,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at,operation)
   VALUES($1,$2,$3,$4,$5,'left.id','right.id','agent','SELECT 1',clock_timestamp(),'explain')`,[randomUUID(),project,pool,...elements]);
  await db.query('SAVEPOINT downgrade');
  await expect(db.query(down)).rejects.toThrow('Cannot downgrade while explain join candidates exist');
  await db.query('ROLLBACK TO SAVEPOINT downgrade');
  expect((await db.query("SELECT operation,run_id FROM token_join_candidate")).rows).toEqual([{operation:'explain',run_id:null}]);
 }finally{await db.query('ROLLBACK');}
});
