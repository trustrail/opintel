import {expect,it} from 'vitest';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {EvidenceMaintenance,PostgresEvidenceReader} from '../src/modules/evidence/index.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {RunId} from '../src/shared/kernel/index.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
resetDatabaseBeforeEach('company');
it('privileged preview audit facts survive evidence rollup without retaining sample values',async()=>{
 const f=await policyFixture(1);await withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{fullRetentionDays:1,rollupRetentionDays:30,redaction:'none'}}]));
 const facts={actorId:f.ctx.userId,objectId:f.ids[0],poolId:f.pool,predicateHash:'a'.repeat(64),time:'2026-10-06T12:00:00Z'};
 const run=await withTenant(f.ctx,async tx=>{const [r]=await tx.query<{id:string;at:string}>("INSERT INTO query_run(project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,'console-preview','query','SELECT 1',$3,clock_timestamp()-interval '2 days') RETURNING id,started_at::text AS at",[f.ctx.projectId,f.pool,{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null}]);await tx.query('INSERT INTO run_completion(run_id,started_at,outcome,source_plan,completed_at) VALUES($1,$2,$3,$4,$2)',[r!.id,r!.at,{kind:'answered',rowCount:1,truncated:false},{rowPreview:facts}]);return r!;});
 unwrap(await new EvidenceMaintenance().project(f.ctx.projectId));
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT row_preview FROM evidence_rollup WHERE id=$1',[run.id]))).toEqual([{row_preview:facts}]);
 expect(unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(run.id),run.at)).metadata.rowPreview).toEqual(facts);
});
