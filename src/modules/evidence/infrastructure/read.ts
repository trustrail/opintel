import {z} from 'zod';
import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {ok,err,DomainError,type RunId} from '../../../shared/kernel/index.js';
import {ActivityEntry,ActivityMetadata,ActivitySummary,EvidenceDetail,type ActivityFilters} from '../../../shared/api/activity.js';
import type {EvidenceContext,EvidencePosition,EvidenceReader} from '../application/read.js';
export const time=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const columns=`r.id,r.project_id AS "projectId",r.pool_id AS "poolId",r.agent_id AS "agentId",r.key_prefix AS "keyPrefix",r.mode,${time('r.started_at')} AS "startedAt",COALESCE(c.outcome->>'kind','incomplete') AS status,(c.outcome->>'rowCount')::bigint::float8 AS "rowCount",c.latency_ms AS "latencyMs",c.synthetic,r.request,'raw' AS "argumentVisibility",r.versions,r.record_kind AS "recordKind",${time('r.rolled_up_at')} AS "rolledUpAt",r.treatment_counts AS "treatmentCounts",r.source_treatment_counts AS "sourceTreatmentCounts",r.capture_percent::float8 AS "capturePercent",r.capture_selected AS "captureSelected",c.detail_captured AS "detailCaptured",r.redactions`;
// A single statement snapshot prevents retention from removing children between reads.
export const childColumns=`COALESCE((SELECT jsonb_agg(jsonb_build_object('elementId',e.element_id,'exposedName',e.exposed_name,'state',e.state,'treatment',e.treatment,'withheldReason',e.withheld_reason) ORDER BY e.exposed_name,e.element_id) FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]') AS elements,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('stage',s.stage,'result',s.result,'ms',s.ms,'code',s.detail->>'code') ORDER BY CASE s.stage WHEN 'validate' THEN 1 WHEN 'execute' THEN 2 WHEN 'record' THEN 3 ELSE 0 END,s.stage) FROM run_stage s WHERE s.run_id=r.id AND s.started_at=r.started_at),'[]') AS stages`;
const joined='FROM evidence_run_read r LEFT JOIN evidence_completion_read c ON c.run_id=r.id AND c.started_at=r.started_at';
const deliveredCounts=`CASE WHEN r.record_kind='rollup' THEN (r.treatment_counts - 'withheld' - 'undecided') ELSE COALESCE((SELECT jsonb_object_agg(treatment,n) FROM (SELECT e.treatment,count(*)::int AS n FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at AND e.state IN ('released','aggregated') GROUP BY e.treatment) deliveries),'{}'::jsonb) END`;
const omissionCounts=`CASE WHEN r.record_kind='rollup' THEN jsonb_build_object('withheld',COALESCE((r.treatment_counts->>'withheld')::int,0),'undecided',COALESCE((r.treatment_counts->>'undecided')::int,0)) ELSE COALESCE((SELECT jsonb_object_agg(state,n) FROM (SELECT e.state,count(*)::int AS n FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at AND e.state IN ('withheld','undecided') GROUP BY e.state) omissions),'{}'::jsonb) END`;
const treated=`(c.outcome->>'kind' IN ('answered','reduced') AND CASE WHEN r.record_kind='rollup' THEN COALESCE((r.treatment_counts->>'tokenized')::int,0)+COALESCE((r.treatment_counts->>'masked')::int,0)+COALESCE((r.treatment_counts->>'aggregate_only')::int,0)>0 ELSE EXISTS(SELECT 1 FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at AND e.state IN ('released','aggregated') AND e.treatment IN ('tokenized','masked','aggregate_only')) END)`;
const metadataColumns=`c.source_plan AS "sourcePlan",${deliveredCounts} AS delivered,${omissionCounts} AS omissions`;
export function activityScope(project:string,filters:ActivityFilters){
 const params:unknown[]=[project],where=['r.project_id=$1'];
 const add=(sql:string,value:unknown)=>{params.push(value);where.push(sql.replaceAll('?',`$${params.length}`));};
 if(filters.poolId)add('r.pool_id=?',filters.poolId);if(filters.agentId)add('r.agent_id=?',filters.agentId);if(filters.mode)add('r.mode=?',filters.mode);
 if(filters.from)add('r.started_at>=?::timestamptz',filters.from);if(filters.to)add('r.started_at<?::timestamptz',filters.to);
 if(filters.outcome)add("COALESCE(c.outcome->>'kind','incomplete')=?",filters.outcome);
 if(filters.answerTreated==='true')where.push(treated);
 if(filters.search){const escaped=filters.search.replace(/[\\%_]/g,'\\$&');add(`(EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.source_plan->'objects')='array' THEN c.source_plan->'objects' ELSE '[]'::jsonb END) o WHERE concat_ws('.',o->>'catalog',o->>'schema',o->>'name') ILIKE ? ESCAPE '\\') OR EXISTS(SELECT 1 FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at AND e.exposed_name ILIKE ? ESCAPE '\\'))`,'%'+escaped+'%');}
 return {params,where};
}
const legacyVersions=z.object({policy:z.number(),catalog:z.number(),vocabulary:z.number(),tokenKey:z.number()});
const storedObjects=z.object({objects:EvidenceDetail.shape.objects.removeDefault()});
const storedTokens=z.object({tokenDeclarations:EvidenceDetail.shape.tokenDeclarations});
const storedSources=z.object({sources:EvidenceDetail.shape.sources.default([])});
function entry(row:Record<string,unknown>){const legacy=typeof row.versions==='object'&&row.versions!==null&&'tokenKey' in row.versions?legacyVersions.safeParse(row.versions):null;const objects=storedObjects.safeParse(row.sourcePlan??{});return ActivityEntry.parse({...row,metadata:ActivityMetadata.parse({objects:objects.success?objects.data.objects:null,delivered:row.delivered??{},omissions:row.omissions??{}}),versions:legacy?.success?{policy:legacy.data.policy,catalog:legacy.data.catalog,vocabulary:legacy.data.vocabulary,tokenKeyVersionSelected:legacy.data.tokenKey||null}:row.versions});}
export class PostgresEvidenceReader implements EvidenceReader {
 async settings(ctx:EvidenceContext){const [row]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));return row?.settings;}
 async list(ctx:EvidenceContext,filters:ActivityFilters,after:EvidencePosition|null,limit:number){
  const {params,where}=activityScope(ctx.projectId,filters);
  if(after){params.push(after.at,after.id);where.push(`(r.started_at,r.id)<($${params.length-1}::timestamptz,$${params.length}::uuid)`);}
  params.push(limit);const rows=await withTenant(ctx,tx=>tx.query<Record<string,unknown>>(`SELECT ${columns},${metadataColumns} ${joined} WHERE ${where.join(' AND ')} ORDER BY r.started_at DESC,r.id DESC LIMIT $${params.length}`,params));
  return ok(rows.map(entry));
 }
 async summary(ctx:EvidenceContext,filters:ActivityFilters){
  // Tabs share pool/agent/search/range scope. Day totals include the selected tab.
  const {params,where}=activityScope(ctx.projectId,{...filters,outcome:undefined,answerTreated:undefined});
  const rows=await withTenant(ctx,tx=>tx.query<{day:string;status:string;answerTreated:boolean;n:number}>(`SELECT to_char(r.started_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day,COALESCE(c.outcome->>'kind','incomplete') AS status,COALESCE(${treated},false) AS "answerTreated",count(*)::float8 AS n ${joined} WHERE ${where.join(' AND ')} GROUP BY 1,2,3 ORDER BY 1 DESC`,params));
  const counts={all:0,refused:0,incomplete:0,answerTreated:0};const days=new Map<string,{day:string;counts:typeof counts;outcomes:Record<string,number>}>();
  for(const row of rows){counts.all+=row.n;if(row.status==='refused')counts.refused+=row.n;if(row.status==='incomplete')counts.incomplete+=row.n;if(row.answerTreated)counts.answerTreated+=row.n;
   if(filters.outcome&&filters.outcome!==row.status||filters.answerTreated==='true'&&!row.answerTreated)continue;
   const day=days.get(row.day)??{day:row.day,counts:{all:0,refused:0,incomplete:0,answerTreated:0},outcomes:{incomplete:0,answered:0,reduced:0,refused:0,clarify:0,failed:0}};
   day.counts.all+=row.n;if(row.status==='refused')day.counts.refused+=row.n;if(row.status==='incomplete')day.counts.incomplete+=row.n;if(row.answerTreated)day.counts.answerTreated+=row.n;day.outcomes[row.status]=(day.outcomes[row.status]??0)+row.n;days.set(row.day,day);
  }
  return ok(ActivitySummary.parse({counts,days:[...days.values()]}));
 }
 async detail(ctx:EvidenceContext,id:RunId,at:string){
  return withTenant(ctx,async tx=>{
   const [row]=await tx.query<Record<string,unknown>>(`SELECT ${columns},${metadataColumns},${time('c.completed_at')} AS "completedAt",c.token_key_version_used AS "tokenKeyVersionUsed",(c.outcome->>'truncated')::boolean AS truncated,c.outcome->>'code' AS "refusalCode",c.outcome->>'stage' AS "refusalStage",c.generated_sql AS "generatedSql",c.freshness,${childColumns},(SELECT jsonb_build_object('id',j.id,'columns',jsonb_build_array(jsonb_build_object('elementId',j.left_element_id,'name',j.left_name),jsonb_build_object('elementId',j.right_element_id,'name',j.right_name))) FROM token_join_candidate j WHERE j.run_id=r.id AND j.attempted_at=r.started_at LIMIT 1) AS candidate ${joined} WHERE r.project_id=$1 AND r.id=$2 AND r.started_at=$3::timestamptz`,[ctx.projectId,id,at]);
   if(!row)return err(new DomainError('not_found','This run was not found in this project.'));
   return ok(detailRecord(row));
  });
 }
}

export function detailRecord(row:Record<string,unknown>):EvidenceDetail {
 const objects=storedObjects.safeParse(row.sourcePlan??{});
 const sources=storedSources.safeParse(row.freshness??{});
 const tokens=storedTokens.safeParse(row.sourcePlan??{});
 const base=entry(row);const delivered:Record<string,number>={},omissions:Record<string,number>={};
 const elements=EvidenceDetail.shape.elements.parse(row.elements??[]);
 for(const e of elements){const target=e.state==='released'||e.state==='aggregated'?delivered:omissions;const key=e.treatment??e.state;target[key]=(target[key]??0)+1;}
 const candidate=ActivityMetadata.shape.refusal.unwrap().unwrap().shape.candidate.safeParse(row.candidate??null);
 const messages:Record<string,string>={sql_not_permitted:'The statement was refused by query inspection.',unsupported_on_token:'This operation is not supported on a tokenized column.',source_unavailable:'A source was unavailable for this request.',memory_exhausted:'The request exceeded the Engine memory limit.',dependency_unavailable:'A required component was unavailable for this request.'};
 const refusal=base.status==='refused'||base.status==='failed'?{message:candidate.success&&candidate.data?'The equality compared columns that cannot match under their treatments. An administrator must make both columns tokenized under a shared domain before this join can work.':messages[String(row.refusalCode)]??'The request was refused. See the recorded reason code.',stage:typeof row.refusalStage==='string'?row.refusalStage:null,candidate:candidate.success?candidate.data:null}:null;
 return EvidenceDetail.parse({...row,...base,metadata:{...base.metadata,delivered:base.recordKind==='rollup'?Object.fromEntries(Object.entries(base.treatmentCounts).filter(([key])=>['clear','tokenized','masked','aggregate_only'].includes(key))):delivered,omissions:base.recordKind==='rollup'?Object.fromEntries(Object.entries(base.treatmentCounts).filter(([key])=>['withheld','undecided'].includes(key))):omissions,refusal},tokenDeclarations:tokens.success?tokens.data.tokenDeclarations:null,objects:objects.success?objects.data.objects:[],sources:sources.success?sources.data.sources:[]});
}
