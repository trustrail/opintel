import {it,expect,vi} from 'vitest';
import {withPlatform,withPlatformAdmin,withTenant} from '../src/platform/db/scope.js';
import {PostgresEvidenceWriter,EvidenceMaintenance,PostgresEvidenceReader} from '../src/modules/evidence/index.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {ExposedName,RunId,UuidV7IdFactory} from '../src/shared/kernel/index.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
resetDatabaseBeforeEach('company');
import type {EvidencePlan} from '../src/modules/evidence/application/write.js';
async function fixture(settings:object){
 const f=await policyFixture(1);await withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:settings}]));
 const principal={pool:{id:f.pool,projectId:f.ctx.projectId},scopeUserId:f.ctx.userId,agentId:'audit',keyPrefix:'test'};
 const plan:EvidencePlan={requiresTokenization:false,versions:{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null},elements:[{elementId:f.ids[0]!,exposedName:ExposedName('field_1'),state:'released',treatment:'clear',withheldReason:null}],sources:[],sourcePlan:{queryEngineVersion:'test',objects:[]},stages:[{stage:'validate',result:'ok',ms:1,detail:{proof:'retained'}}]};
 return {...f,principal,plan,writer:new PostgresEvidenceWriter(),maintenance:new EvidenceMaintenance()};
}
it('Q-026: aggressive and allowlist redact at rest before open; none preserves arguments',async()=>{
 for(const mode of ['aggressive','allowlist','none']){
  const f=await fixture({redaction:mode,allowlistedFields:['sql']});const id=unwrap(await f.writer.open(f.principal,"SELECT 'LITERAL_SENTINEL' AS named",f.plan));
  const [row]=await withTenant(f.ctx,tx=>tx.query<{request:string|null}>('SELECT request FROM query_run WHERE id=$1',[id]));
  if(mode==='none')expect(row?.request).toContain('LITERAL_SENTINEL');else expect(row?.request??'').not.toContain('LITERAL_SENTINEL');
  if(mode==='allowlist')expect(row?.request).toContain('named');
  const events=await withTenant(f.ctx,tx=>tx.query<{policy:{redaction:string};fields:string[]}>('SELECT policy,fields FROM evidence_redaction WHERE run_id=$1',[id]));
  expect(events).toHaveLength(mode==='none'?0:1);if(mode!=='none')expect(events[0]).toMatchObject({policy:{redaction:mode},fields:['request']});
 }
});
it('Q-026: historical redaction is recorded and cannot be reversed; ordinary UPDATE/DELETE remain forbidden',async()=>{
 const f=await fixture({redaction:'none'});const id=unwrap(await f.writer.open(f.principal,"SELECT 'HISTORICAL_SENTINEL'",f.plan));
 await withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{redaction:'aggressive'}}]));unwrap(await f.maintenance.project(f.ctx.projectId));
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT request FROM query_run WHERE id=$1',[id]))).toEqual([{request:null}]);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM evidence_redaction WHERE run_id=$1',[id]))).toHaveLength(1);
 unwrap(await f.maintenance.project(f.ctx.projectId));expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM evidence_redaction WHERE run_id=$1',[id]))).toHaveLength(1);
 await expect(withTenant(f.ctx,tx=>tx.query("UPDATE query_run SET request='restore' WHERE id=$1",[id]))).rejects.toMatchObject({code:'42501'});
 await expect(withTenant(f.ctx,tx=>tx.query('DELETE FROM query_run WHERE id=$1',[id]))).rejects.toMatchObject({code:'42501'});
 await expect(withTenant(f.ctx,tx=>tx.query('SELECT retain_evidence($1)',[f.ctx.projectId]))).rejects.toMatchObject({code:'42501'});
});
it('Q-027: only success loses detail; selection and percentage stay pinned across a setting change',async()=>{
 const f=await fixture({captureSamplingPercent:0.000000001});
 const firstId=vi.spyOn(UuidV7IdFactory.prototype,'create').mockReturnValueOnce('018f8f9d-7f83-7abc-8def-000000009001');let id:ReturnType<typeof RunId>;try{id=unwrap(await f.writer.open(f.principal,'SELECT 1',f.plan));}finally{firstId.mockRestore();}
 const [header]=await withTenant(f.ctx,tx=>tx.query<{capture_selected:boolean}>('SELECT capture_selected FROM query_run WHERE id=$1',[id]));expect(header?.capture_selected).toBe(false);
 await withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{captureSamplingPercent:100}}]));
 unwrap(await f.writer.close(id,{kind:'answered',rows:1,policyVersion:1,queryEngineVersion:'test',plan:f.plan,tokenKeyVersionUsed:null,sourceIdsReached:[]},f.principal));
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT capture_percent::float8,capture_selected FROM query_run WHERE id=$1',[id]))).toEqual([{capture_percent:0.000000001,capture_selected:false}]);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT detail_captured,source_plan FROM run_completion WHERE run_id=$1',[id]))).toEqual([{detail_captured:false,source_plan:null}]);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT element_id FROM run_element WHERE run_id=$1',[id]))).toHaveLength(1);
 const f2=await fixture({captureSamplingPercent:0.000000001});
 const nextId=vi.spyOn(UuidV7IdFactory.prototype,'create').mockReturnValueOnce('018f8f9d-7f83-7abc-8def-000000009002');let refused:ReturnType<typeof RunId>;try{refused=unwrap(await f2.writer.open(f2.principal,'SELECT 1',f2.plan));}finally{nextId.mockRestore();}
 unwrap(await f2.writer.close(refused,{kind:'refused',code:'dependency_unavailable',message:'Failure',plan:f2.plan,tokenKeyVersionUsed:null,sourceIdsReached:[]},f2.principal));
 expect(await withTenant(f2.ctx,tx=>tx.query('SELECT detail_captured,source_plan FROM run_completion WHERE run_id=$1',[refused]))).toEqual([{detail_captured:true,source_plan:f2.plan.sourcePlan}]);
});
it('Q-025: full records atomically become visible rollups with a fresh retention clock; incomplete runs survive',async()=>{
 const f=await fixture({fullRetentionDays:1,rollupRetentionDays:1});
 const [run]=await withTenant(f.ctx,async tx=>{
  const rows=await tx.query<{id:string;at:string}>("INSERT INTO query_run(project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,'test','query','SELECT 1',$3,clock_timestamp()-interval '2 days') RETURNING id,started_at::text AS at",[f.ctx.projectId,f.pool,f.plan.versions]);const r=rows[0]!;
  await tx.query("INSERT INTO run_element(run_id,started_at,element_id,exposed_name,state,treatment) VALUES($1,$2,$3,'field_1','released','clear')",[r.id,r.at,f.ids[0]]);
  await tx.query("INSERT INTO run_completion(run_id,started_at,outcome,completed_at) VALUES($1,$2,$3,$2)",[r.id,r.at,{kind:'answered',rowCount:1,truncated:false}]);return rows;
 });
 const incomplete=unwrap(await f.writer.open(f.principal,'SELECT 2',f.plan));
 unwrap(await f.maintenance.project(f.ctx.projectId));unwrap(await f.maintenance.project(f.ctx.projectId));
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM query_run WHERE id=$1',[run!.id]))).toHaveLength(0);
 const rolled=await withTenant(f.ctx,tx=>tx.query('SELECT treatment_counts,minimum_retention_days FROM evidence_rollup WHERE id=$1',[run!.id]));expect(rolled).toEqual([{treatment_counts:{clear:1},minimum_retention_days:1}]);
 const detail=unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(run!.id),run!.at));expect(detail).toMatchObject({recordKind:'rollup',elements:[],stages:[],treatmentCounts:{clear:1}});
 const outsider=await policyFixture(0);expect(await withTenant(outsider.ctx,tx=>tx.query('SELECT id FROM evidence_run_read WHERE id=$1',[run!.id]))).toEqual([]);
 const list=unwrap(await new PostgresEvidenceReader().list(f.ctx,{},null,50));expect(list.find(r=>r.id===run!.id)).toMatchObject({recordKind:'rollup',treatmentCounts:{clear:1},request:null});expect(list.find(r=>r.id===incomplete)).toMatchObject({status:'incomplete',recordKind:'full'});
});
it('forward provisioning creates month +3 with app grants and forced RLS',async()=>{
 await new EvidenceMaintenance().provision();
 const rows=await withPlatformAdmin({actor:{kind:'system',name:'test'}},tx=>tx.query<{relforcerowsecurity:boolean;can_update:boolean}>("SELECT c.relforcerowsecurity,has_table_privilege('opintel_app',c.oid,'UPDATE') AS can_update FROM pg_class c WHERE c.relname='query_run_'||to_char(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '3 months','YYYYMM')"));expect(rows).toEqual([{relforcerowsecurity:true,can_update:false}]);
});
