import {z} from 'zod';
import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {ok,err,DomainError,type RunId} from '../../../shared/kernel/index.js';
import {ActivityEntry,EvidenceDetail,type ActivityFilters} from '../../../shared/api/activity.js';
import type {EvidenceContext,EvidencePosition,EvidenceReader} from '../application/read.js';
export const time=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const columns=`r.id,r.project_id AS "projectId",r.pool_id AS "poolId",r.agent_id AS "agentId",r.key_prefix AS "keyPrefix",r.mode,${time('r.started_at')} AS "startedAt",COALESCE(c.outcome->>'kind','incomplete') AS status,(c.outcome->>'rowCount')::bigint::float8 AS "rowCount",c.latency_ms AS "latencyMs",c.synthetic,r.request,'raw' AS "argumentVisibility",r.versions,r.record_kind AS "recordKind",${time('r.rolled_up_at')} AS "rolledUpAt",r.treatment_counts AS "treatmentCounts",r.source_treatment_counts AS "sourceTreatmentCounts",r.capture_percent::float8 AS "capturePercent",r.capture_selected AS "captureSelected",c.detail_captured AS "detailCaptured",r.redactions`;
// A single statement snapshot prevents retention from removing children between reads.
export const childColumns=`COALESCE((SELECT jsonb_agg(jsonb_build_object('elementId',e.element_id,'exposedName',e.exposed_name,'state',e.state,'treatment',e.treatment,'withheldReason',e.withheld_reason) ORDER BY e.exposed_name,e.element_id) FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]') AS elements,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('stage',s.stage,'result',s.result,'ms',s.ms,'code',s.detail->>'code') ORDER BY CASE s.stage WHEN 'validate' THEN 1 WHEN 'execute' THEN 2 WHEN 'record' THEN 3 ELSE 0 END,s.stage) FROM run_stage s WHERE s.run_id=r.id AND s.started_at=r.started_at),'[]') AS stages`;
const joined='FROM evidence_run_read r LEFT JOIN evidence_completion_read c ON c.run_id=r.id AND c.started_at=r.started_at';
const legacyVersions=z.object({policy:z.number(),catalog:z.number(),vocabulary:z.number(),tokenKey:z.number()});
const storedObjects=z.object({objects:EvidenceDetail.shape.objects});
const storedTokens=z.object({tokenDeclarations:EvidenceDetail.shape.tokenDeclarations});
const storedSources=z.object({sources:EvidenceDetail.shape.sources.default([])});
function entry(row:Record<string,unknown>){const legacy=typeof row.versions==='object'&&row.versions!==null&&'tokenKey' in row.versions?legacyVersions.safeParse(row.versions):null;return ActivityEntry.parse({...row,versions:legacy?.success?{policy:legacy.data.policy,catalog:legacy.data.catalog,vocabulary:legacy.data.vocabulary,tokenKeyVersionSelected:legacy.data.tokenKey||null}:row.versions});}
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
   const [row]=await tx.query<Record<string,unknown>>(`SELECT ${columns},${time('c.completed_at')} AS "completedAt",c.token_key_version_used AS "tokenKeyVersionUsed",(c.outcome->>'truncated')::boolean AS truncated,c.outcome->>'code' AS "refusalCode",c.generated_sql AS "generatedSql",c.freshness,c.source_plan AS "sourcePlan",${childColumns} ${joined} WHERE r.project_id=$1 AND r.id=$2 AND r.started_at=$3::timestamptz`,[ctx.projectId,id,at]);
   if(!row)return err(new DomainError('not_found','This run was not found in this project.'));
   return ok(detailRecord(row));
  });
 }
}

export function detailRecord(row:Record<string,unknown>):EvidenceDetail {
 const objects=storedObjects.safeParse(row.sourcePlan??{});
 const sources=storedSources.safeParse(row.freshness??{});
 const tokens=storedTokens.safeParse(row.sourcePlan??{});
 return EvidenceDetail.parse({...row,...entry(row),tokenDeclarations:tokens.success?tokens.data.tokenDeclarations:null,objects:objects.success?objects.data.objects:[],sources:sources.success?sources.data.sources:[]});
}
