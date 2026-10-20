import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {ZodError} from 'zod';
import {PostgresEvidenceReader} from '../src/modules/evidence/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {RunId} from '../src/shared/kernel/index.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
resetDatabaseBeforeEach('company');
it('E06-COMPAT: historical normalization requires a stored key, preserves explicit null/zero, and rejects absence or conflict',async()=>{
 const f=await policyFixture(1),reader=new PostgresEvidenceReader();
 const identity={objectId:randomUUID(),objectName:'records',poolId:f.pool,decisionId:randomUUID(),hash:'a'.repeat(64),columns:['id'],provenance:'agent credential',missingDecision:false};
 for(const count of [{entitledRows:2},{returnedRows:2},{entitledRows:0},{returnedRows:0},{entitledRows:null},{returnedRows:null},{},{entitledRows:1,returnedRows:2}]){
  const id=RunId(randomUUID()),[header]=await withTenant(f.ctx,async tx=>{
   const rows=await tx.query<{at:string}>("INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'test','query','SELECT 1',$4,clock_timestamp()) RETURNING started_at::text AS at",[id,f.ctx.projectId,f.pool,{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null}]);
   await tx.query('INSERT INTO run_completion(run_id,started_at,outcome,source_plan,completed_at) VALUES($1,$2,$3,$4,$2)',[id,rows[0]!.at,{kind:'answered',rowCount:1,truncated:false},{rowScopes:[{...identity,...count}]}]);return rows;
  });
  const legacy='entitledRows' in count,current='returnedRows' in count;
  if(legacy===current)await expect(reader.detail(f.ctx,id,header!.at)).rejects.toBeInstanceOf(ZodError);
  else expect(unwrap(await reader.detail(f.ctx,id,header!.at)).metadata.rowScopes).toEqual([{...identity,returnedRows:legacy?count.entitledRows:count.returnedRows}]);
  const [stored]=await withTenant(f.ctx,tx=>tx.query<{source_plan:unknown}>('SELECT source_plan FROM run_completion WHERE run_id=$1',[id]));expect(stored?.source_plan).toEqual({rowScopes:[{...identity,...count}]});
 }
});
