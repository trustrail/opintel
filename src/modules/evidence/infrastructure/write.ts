import {z} from 'zod';
import {createHash} from 'node:crypto';
import {readSetting,projectSettingSchema} from '../../../shared/project-settings.js';
import {evidencePolicy,storedArgument} from '../application/lifecycle.js';
import {DuckDBEvidenceText} from './text.js';
import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {DomainError,err,ok,RunId,UuidV7IdFactory,ExposedName} from '../../../shared/kernel/index.js';
import {parseQueryRun} from '../application/record-schema.js';
import type {EvidenceWriterPort,EvidencePrincipal,EvidencePlan,EvidenceFinish} from '../application/write.js';
/** Two transactions: a durable open, then atomic children + terminal append.
 * No row values enter this port. No current decisions are consulted at close. */
export class PostgresEvidenceWriter implements EvidenceWriterPort {
 readonly implementation='durable' as const;
 async open(principal:EvidencePrincipal,sql:string,plan?:EvidencePlan){
  if(plan?.requiresTokenization&&plan.versions.tokenKeyVersionSelected===null)return err(new DomainError('dependency_unavailable','Initialize token key custody before running a tokenized plan. No source was contacted.'));
  const ctx={projectId:principal.pool.projectId,userId:principal.scopeUserId};
  const id=RunId(new UuidV7IdFactory().create());
  const [row]=await withPlatform(tx=>tx.query<{versions:unknown;settings:unknown}>(`SELECT jsonb_build_object('policy',p.policy_version,'catalog',p.catalog_generation,'vocabulary',i.vocabulary_version+p.vocabulary_revision,'tokenKeyVersionSelected',NULL) AS versions,p.settings FROM project p JOIN industry i ON i.id=p.industry_id WHERE p.id=$1`,[ctx.projectId]));
   if(!row)return err(new DomainError('not_found','The evidence project was not found.'));
  const policy=evidencePolicy(row.settings),request=await storedArgument(sql,'sql',policy,new DuckDBEvidenceText());
  const parsedPercent=projectSettingSchema('evidence.captureSamplingPercent').safeParse(readSetting(row.settings,'evidence.captureSamplingPercent'));
  const percent=parsedPercent.success?Number(parsedPercent.data):100;
  const selected=createHash('sha256').update(id).digest().readUInt32BE(0)/4294967296*100<percent;
  return withTenant(ctx,async tx=>{
   await tx.query(`INSERT INTO query_run(id,project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at,capture_percent,capture_selected) VALUES($1,$2,$3,$4,$5,'query',$6,$7,clock_timestamp(),$8,$9)`,[id,ctx.projectId,principal.pool.id,principal.agentId,principal.keyPrefix,request,plan?.versions??row.versions,percent,selected]);
   if(request!==sql)await tx.query("INSERT INTO evidence_redaction(project_id,run_id,started_at,policy,fields) SELECT project_id,id,started_at,$2,ARRAY['request'] FROM query_run WHERE id=$1",[id,policy]);
   return ok(id);
  });
 }
 async close(id:RunId,finish:EvidenceFinish,principal:EvidencePrincipal){
  const ctx={projectId:principal.pool.projectId,userId:principal.scopeUserId};
  const recordingStarted=performance.now();
  return withTenant(ctx,async tx=>{
   const [row]=await tx.query<{header:Record<string,unknown>;startedAt:string;captureSelected:boolean}>(`SELECT capture_selected AS "captureSelected",started_at::text AS "startedAt",jsonb_build_object('id',id,'projectId',project_id,'poolId',pool_id,'agentId',agent_id,'keyPrefix',key_prefix,'mode',mode,'request',request,'versions',versions,'startedAt',started_at) AS header FROM query_run WHERE id=$1 AND pool_id=$2`,[id,principal.pool.id]);
   if(!row)return err(new DomainError('not_found','The open evidence record was not found.'));
   const plan=finish.plan;
   // Sampling may omit detail only for successes. Refusals/failures override selection.
   const detailCaptured=finish.kind!=='answered'||row.captureSelected;
   const elements=(plan?.elements??[]).filter(e=>finish.kind==='answered'||e.state==='withheld'||e.state==='undecided');
   if(finish.kind==='refused'&&finish.details?.cause==='column_absent'&&typeof finish.details.name==='string')elements.push({elementId:null,exposedName:ExposedName(finish.details.name),state:'undecided',treatment:null,withheldReason:finish.message??'The named element is unknown.'});
   const stage=finish.kind==='refused'?finish.stage??'validate':'execute';
   const stages=[...(detailCaptured?plan?.stages??[]:[]),{stage,result:finish.kind==='answered'?'ok':'refuse',ms:finish.elapsedMs??0,detail:finish.kind==='answered'?(detailCaptured?finish.execution??null:null):{code:finish.code,message:finish.message??finish.code,...finish.details}}];
   const withheld=elements.filter(e=>e.state==='withheld').length;
   const outcome=finish.kind==='answered'?{kind:withheld?'reduced':'answered',rowCount:finish.rows,truncated:finish.truncated??false,...(withheld?{withheld}:{})}:{kind:'refused',code:finish.code,element:typeof finish.details?.name==='string'?finish.details.name:null,stage};
   const reached=(plan?.sources??[]).filter(s=>finish.sourceIdsReached?.includes(s.id));
   const completion={outcome,tokenKeyVersionUsed:finish.tokenKeyVersionUsed??null,cil:null,sourcePlan:detailCaptured?plan?.sourcePlan??null:plan?.sourcePlan.tokenDeclarations!==undefined?{tokenDeclarations:plan.sourcePlan.tokenDeclarations}:null,generatedSql:null,latencyMs:finish.elapsedMs??null,freshness:{sources:reached},synthetic:reached.some(s=>s.origin==='demo'),completedAt:new Date().toISOString()};
   const record=parseQueryRun({header:row.header,elements,stages,completion});if(!record.ok)return record;
   if(finish.kind==='refused'&&finish.details?.cause==='unsatisfiable_token_join'){
    const candidate=z.object({columns:z.tuple([z.object({elementId:z.uuid(),name:z.string().min(1)}),z.object({elementId:z.uuid(),name:z.string().min(1)})])}).safeParse(finish.details);
    if(!candidate.success||!finish.attemptedStatement)return err(new DomainError('dependency_unavailable','The refused join attempt could not be recorded.'));
    const [left,right]=candidate.data.columns;
    await tx.query(`INSERT INTO token_join_candidate(run_id,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,ctx.projectId,principal.pool.id,left.elementId,right.elementId,left.name,right.name,principal.agentId,finish.attemptedStatement,row.startedAt]);
   }
   for(const s of record.value.state.stages)await tx.query('INSERT INTO run_stage(run_id,started_at,stage,result,detail,ms) VALUES($1,$2,$3,$4,$5,$6)',[id,row.startedAt,s.stage,s.result,s.detail,s.ms]);
   for(const e of record.value.state.elements)await tx.query('INSERT INTO run_element(run_id,started_at,element_id,exposed_name,state,treatment,withheld_reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,row.startedAt,e.elementId,e.exposedName,e.state,e.treatment,e.withheldReason]);
   await tx.query("INSERT INTO run_stage(run_id,started_at,stage,result,detail,ms) VALUES($1,$2,'record','ok',NULL,$3)",[id,row.startedAt,Math.max(0,Math.round(performance.now()-recordingStarted))]);
   await tx.query('INSERT INTO run_completion(run_id,started_at,outcome,cil,source_plan,generated_sql,latency_ms,freshness,synthetic,completed_at,token_key_version_used,detail_captured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,row.startedAt,completion.outcome,null,completion.sourcePlan,null,completion.latencyMs,completion.freshness,completion.synthetic,completion.completedAt,completion.tokenKeyVersionUsed,detailCaptured]);
   return ok(undefined);
  });
 }
}
