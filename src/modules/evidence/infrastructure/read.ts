import {z} from 'zod';
import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {ok,err,DomainError,type RunId} from '../../../shared/kernel/index.js';
import {ActivityEntry,EvidenceDetail,type ActivityFilters} from '../../../shared/api/activity.js';
import type {EvidenceContext,EvidencePosition,EvidenceReader} from '../application/read.js';
const time=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const columns=`r.id,r.project_id AS "projectId",r.pool_id AS "poolId",r.agent_id AS "agentId",r.key_prefix AS "keyPrefix",r.mode,${time('r.started_at')} AS "startedAt",COALESCE(c.outcome->>'kind','incomplete') AS status,(c.outcome->>'rowCount')::bigint::float8 AS "rowCount",c.latency_ms AS "latencyMs",c.synthetic,r.request,'raw' AS "argumentVisibility",r.versions`;
const joined='FROM query_run r LEFT JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at';
function entry(row:Record<string,unknown>){const legacy=z.object({policy:z.number(),catalog:z.number(),vocabulary:z.number(),tokenKey:z.number()}).safeParse(row.versions);return ActivityEntry.parse({...row,versions:legacy.success?{policy:legacy.data.policy,catalog:legacy.data.catalog,vocabulary:legacy.data.vocabulary,tokenKeyVersionSelected:legacy.data.tokenKey||null}:row.versions});}
export class PostgresEvidenceReader implements EvidenceReader {
 async settings(ctx:EvidenceContext){const [row]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));return row?.settings;}
 async list(ctx:EvidenceContext,filters:ActivityFilters,after:EvidencePosition|null,limit:number){
  const params:unknown[]=[ctx.projectId];const where=['r.project_id=$1'];
  const add=(sql:string,value:unknown)=>{params.push(value);where.push(sql.replace('?',`$${params.length}`));};
  if(filters.poolId)add('r.pool_id=?',filters.poolId);if(filters.agentId)add('r.agent_id=?',filters.agentId);if(filters.mode)add('r.mode=?',filters.mode);
  if(filters.from)add('r.started_at>=?::timestamptz',filters.from);if(filters.to)add('r.started_at<?::timestamptz',filters.to);
  if(filters.outcome)add("COALESCE(c.outcome->>'kind','incomplete')=?",filters.outcome);
  if(after){params.push(after.at,after.id);where.push(`(r.started_at,r.id)<($${params.length-1}::timestamptz,$${params.length}::uuid)`);}
  params.push(limit);const rows=await withTenant(ctx,tx=>tx.query<Record<string,unknown>>(`SELECT ${columns} ${joined} WHERE ${where.join(' AND ')} ORDER BY r.started_at DESC,r.id DESC LIMIT $${params.length}`,params));
  return ok(rows.map(entry));
 }
 async detail(ctx:EvidenceContext,id:RunId,at:string){
  return withTenant(ctx,async tx=>{
   const [row]=await tx.query<Record<string,unknown>>(`SELECT ${columns},${time('c.completed_at')} AS "completedAt",c.token_key_version_used AS "tokenKeyVersionUsed",(c.outcome->>'truncated')::boolean AS truncated,c.outcome->>'code' AS "refusalCode",c.generated_sql AS "generatedSql",c.freshness,c.source_plan AS "sourcePlan" ${joined} WHERE r.project_id=$1 AND r.id=$2 AND r.started_at=$3::timestamptz`,[ctx.projectId,id,at]);
   if(!row)return err(new DomainError('not_found','This run was not found in this project.'));
   const elements=await tx.query('SELECT element_id AS "elementId",exposed_name AS "exposedName",state,treatment,withheld_reason AS "withheldReason" FROM run_element WHERE run_id=$1 AND started_at=$2::timestamptz ORDER BY exposed_name,element_id',[id,at]);
   // Arbitrary stage/CIL/plan JSON can contain argument values. Only declared
   // metadata crosses this read boundary, regardless of redaction mode.
   const stages=await tx.query("SELECT stage,result,ms,detail->>'code' AS code FROM run_stage WHERE run_id=$1 AND started_at=$2::timestamptz ORDER BY CASE stage WHEN 'validate' THEN 1 WHEN 'execute' THEN 2 WHEN 'record' THEN 3 ELSE 0 END,stage",[id,at]);
   const objects=z.object({objects:EvidenceDetail.shape.objects}).safeParse(row.sourcePlan??{});
   const sources=z.object({sources:EvidenceDetail.shape.sources.default([])}).safeParse(row.freshness??{});
   return ok(EvidenceDetail.parse({...row,...entry(row),elements,stages,objects:objects.success?objects.data.objects:[],sources:sources.success?sources.data.sources:[]}));
  });
 }
}
