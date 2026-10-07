import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {ok,err,DomainError,UuidV7IdFactory,ElementId,type PoolId} from '../../../shared/kernel/index.js';
import {SuggestionPage,DomainPage,AttemptPage} from '../../../shared/api/suggestions.js';
import {effectiveTokenDomain} from '../../../shared/token-domain.js';
import type {EvidenceQuery} from '../../evidence/index.js';
import type {SuggestionRepository,ReviewContext} from '../application/review.js';
const name=`concat_ws('.',s.exposed_alias,o.exposed_schema,o.exposed_name,e.exposed_name)`;
const members=`SELECT e.id AS "elementId",${name} AS name,o.exposed_name AS "objectLabel",e.exposed_name AS "columnName",(SELECT max(version) FROM token_domain_assignment a WHERE a.element_id=e.id) AS version FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id WHERE e.token_domain=$1 ORDER BY e.id`;
const groups=`SELECT (array_agg(c.id ORDER BY c.attempted_at,c.id))[1] AS id,array_agg(c.id) AS attempt_ids,LEAST(c.left_element_id,c.right_element_id) AS l,GREATEST(c.left_element_id,c.right_element_id) AS r,
 count(*) FILTER(WHERE c.operation='query')::int AS queries,count(*) FILTER(WHERE c.operation='explain')::int AS explains,max(c.attempted_at) AS latest_at,
 (array_agg(c.id ORDER BY c.attempted_at DESC,c.id DESC))[1] AS latest_id,array_agg(DISTINCT c.agent_id) AS agents,
 jsonb_agg(DISTINCT jsonb_build_object('id',p.id,'name',p.name)) AS pools,
 (array_agg(CASE WHEN c.left_element_id<c.right_element_id THEN c.left_name ELSE c.right_name END ORDER BY c.attempted_at DESC,c.id DESC))[1] AS left_name,
 (array_agg(CASE WHEN c.left_element_id<c.right_element_id THEN c.right_name ELSE c.left_name END ORDER BY c.attempted_at DESC,c.id DESC))[1] AS right_name
 FROM token_join_candidate c JOIN pool p ON p.id=c.pool_id GROUP BY LEAST(c.left_element_id,c.right_element_id),GREATEST(c.left_element_id,c.right_element_id)`;
const blocked=`NOT EXISTS(SELECT 1 FROM token_join_candidate c WHERE LEAST(c.left_element_id,c.right_element_id)=g.l AND GREATEST(c.left_element_id,c.right_element_id)=g.r AND
 (NOT EXISTS(SELECT 1 FROM entitlement t WHERE t.pool_id=c.pool_id AND t.element_id=g.l AND t.treatment='tokenized') OR NOT EXISTS(SELECT 1 FROM entitlement t WHERE t.pool_id=c.pool_id AND t.element_id=g.r AND t.treatment='tokenized')))`;

// These are catalogue and entitlement facts, not source-value reads. Treatment
// remains pool-specific: choosing one pool's decision would hide blocked cases.
const column=(side:'l'|'r')=>`jsonb_build_object('id',g.${side},'name',concat_ws('.',${side}s.exposed_alias,${side}o.exposed_schema,${side}o.exposed_name,COALESCE(${side}e.exposed_name,'[unnameable element]')),
 'active',${side}e.status='active' AND ${side}o.status='active' AND ${side}s.status<>'archived',
 'address',jsonb_build_object('sourceId',${side}s.id,'sourceName',${side}s.name,'alias',${side}s.exposed_alias,'schema',${side}o.exposed_schema,'object',${side}o.exposed_name,'column',${side}e.exposed_name),
 'exposedType',${side}e.exposed_type,'domain',jsonb_build_object('declared',${side}e.token_domain,'memberCount',CASE WHEN ${side}e.token_domain IS NULL THEN 1 ELSE (SELECT count(*)::int FROM catalog_element d WHERE d.token_domain=${side}e.token_domain) END),
 'treatments',(SELECT jsonb_agg(jsonb_build_object('poolId',p.id,'poolName',p.name,'treatment',t.treatment) ORDER BY p.name,p.id) FROM pool p LEFT JOIN entitlement t ON t.pool_id=p.id AND t.element_id=g.${side}
 WHERE EXISTS(SELECT 1 FROM token_join_candidate c WHERE c.pool_id=p.id AND LEAST(c.left_element_id,c.right_element_id)=g.l AND GREATEST(c.left_element_id,c.right_element_id)=g.r)))`;
const trend=`(SELECT jsonb_agg(jsonb_build_object('day',d.day::date::text,'queries',d.queries,'explains',d.explains) ORDER BY d.day) FROM (
 SELECT day,count(c.id) FILTER(WHERE c.operation='query')::int AS queries,count(c.id) FILTER(WHERE c.operation='explain')::int AS explains
 FROM generate_series(((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-6)::timestamp,((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)::timestamp,interval '1 day') day
 LEFT JOIN token_join_candidate c ON LEAST(c.left_element_id,c.right_element_id)=g.l AND GREATEST(c.left_element_id,c.right_element_id)=g.r
 AND c.attempted_at>=day AT TIME ZONE 'UTC' AND c.attempted_at<(day+interval '1 day') AT TIME ZONE 'UTC' GROUP BY day)d)`;

const missing=()=>err(new DomainError('not_found','This suggestion was not found in this project.'));
export class PostgresSuggestions implements SuggestionRepository {
 constructor(private readonly evidence:Pick<EvidenceQuery,'redactSql'>){}
 async list(ctx:ReviewContext,cursor:string|undefined,limit:number,filter:{elementId?:ElementId;poolId?:PoolId;view?:'open'|'reviewed'|'all'}={}){const [project]=await withPlatform(tx=>tx.query<{name:string}>('SELECT name FROM project WHERE id=$1',[ctx.projectId]));const result=await withTenant(ctx,async tx=>{
  const rows=await tx.query<Record<string,unknown>>(`WITH g AS (${groups}) SELECT g.id,${column('l')} AS left,${column('r')} AS right,${trend} AS trend,g.queries,g.explains,g.latest_at::text AS "latestAt",g.latest_id AS "latestAttemptId",g.agents,g.pools,
   CASE WHEN le.status<>'active' OR re.status<>'active' OR lo.status<>'active' OR ro.status<>'active' OR ls.status='archived' OR rs.status='archived' THEN 'A column or source is no longer active.' WHEN NOT(${blocked}) THEN 'Both columns must be tokenized in every pool that attempted this join. Change each non-tokenized entitlement to tokenized first.' ELSE NULL END AS "confirmationBlocked",
   COALESCE(v.action,'pending') AS status,COALESCE(v.action='not_sure' AND g.latest_id<>v.latest_attempt_id,false) AS "raisedAgain",
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'actorId',h.actor_id,'actorName',h.actor_id::text,'at',h.reviewed_at::text,'domain',h.domain,'assignments',h.assignments) ORDER BY h.reviewed_at,h.id) FROM token_join_review h WHERE h.left_element_id=g.l AND h.right_element_id=g.r),'[]') AS history
   FROM g JOIN catalog_element le ON le.id=g.l JOIN catalog_object lo ON lo.id=le.object_id JOIN data_source ls ON ls.id=lo.source_id
   JOIN catalog_element re ON re.id=g.r JOIN catalog_object ro ON ro.id=re.object_id JOIN data_source rs ON rs.id=ro.source_id
   LEFT JOIN LATERAL(SELECT * FROM token_join_review h WHERE h.left_element_id=g.l AND h.right_element_id=g.r ORDER BY h.reviewed_at DESC,h.id DESC LIMIT 1)v ON true
   WHERE ($1::uuid IS NULL OR (g.latest_at,g.id)<(SELECT latest_at,id FROM g WHERE $1=ANY(attempt_ids))) AND ($3::uuid IS NULL OR $3 IN(g.l,g.r)) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM token_join_candidate c WHERE c.id=ANY(g.attempt_ids) AND c.pool_id=$4)) AND ($5='all' OR ($5='open' AND COALESCE(v.action,'pending') IN ('pending','not_sure')) OR ($5='reviewed' AND v.action IN ('confirm','reject'))) ORDER BY g.latest_at DESC,g.id DESC LIMIT $2`,[cursor??null,limit+1,filter.elementId??null,filter.poolId??null,filter.view??'open']);
  const page=rows.slice(0,limit).map(row=>{
   const raw=row as {left:{id:string;domain:{declared:string|null}};right:{id:string;domain:{declared:string|null}}};
   const enrich=(c:typeof raw.left)=>({...c,domain:{...c.domain,effective:effectiveTokenDomain(c.domain.declared,{projectId:ctx.projectId,elementId:ElementId(c.id)}),provenance:c.domain.declared===null?'element_identity':'declared'}});
   return {...row,left:enrich(raw.left),right:enrich(raw.right)};
  }),last=page.at(-1) as {id:string}|undefined;
  return ok(SuggestionPage.parse({items:page,nextCursor:rows.length>limit?last?.id:null,projectName:project?.name??''}));
 });
 if(!result.ok)return result;
 const ids=[...new Set(result.value.items.flatMap(i=>i.history.map(h=>h.actorId)))];
 const actors=await withPlatform(tx=>tx.query<{id:string;name:string}>('SELECT id,COALESCE(full_name,email) AS name FROM user_account WHERE id=ANY($1::uuid[])',[ids]));
 const names=new Map(actors.map(a=>[a.id,a.name]));
 return ok({...result.value,items:result.value.items.map(i=>({...i,history:i.history.map(h=>({...h,actorName:names.get(h.actorId)??h.actorId}))}))});
 }
 async domains(ctx:ReviewContext,cursor:string|undefined,limit:number){return withTenant(ctx,async tx=>{
  const rows=await tx.query<{domain:string}>("SELECT DISTINCT token_domain AS domain FROM catalog_element WHERE token_domain IS NOT NULL AND ($1::text IS NULL OR token_domain>$1) ORDER BY token_domain LIMIT $2",[cursor??null,limit+1]);
  const items=[];for(const row of rows.slice(0,limit))items.push({domain:row.domain,members:await tx.query(members,[row.domain])});
  return ok(DomainPage.parse({items,nextCursor:rows.length>limit?items.at(-1)?.domain:null}));
 });}
 async attempts(ctx:ReviewContext,id:string,cursor:string|undefined,limit:number){
  const raw=await withTenant(ctx,async tx=>{
   const [pair]=await tx.query<{l:ElementId;r:ElementId}>(`WITH g AS (${groups}) SELECT l,r FROM g WHERE $1=ANY(attempt_ids)`,[id]);if(!pair)return missing();
   const rows=await tx.query<{id:string;operation:'query'|'explain';at:string;agentId:string;statement:string}>(`SELECT id,operation,attempted_at::text AS at,agent_id AS "agentId",statement FROM token_join_candidate WHERE LEAST(left_element_id,right_element_id)=$1 AND GREATEST(left_element_id,right_element_id)=$2 AND ($3::uuid IS NULL OR (attempted_at,id)<(SELECT attempted_at,id FROM token_join_candidate WHERE id=$3)) ORDER BY attempted_at DESC,id DESC LIMIT $4`,[pair.l,pair.r,cursor??null,limit+1]);return ok(rows);
  });if(!raw.ok)return raw;
  const rows=raw.value.slice(0,limit),redacted=await this.evidence.redactSql(ctx,rows.map(r=>r.statement));if(!redacted.ok)return redacted;
  return ok(AttemptPage.parse({items:rows.map((row,i)=>({...row,...redacted.value[i]})),nextCursor:raw.value.length>limit?rows.at(-1)?.id:null}));
 }
 async decide(ctx:ReviewContext,id:string,input:Parameters<SuggestionRepository['decide']>[2]){const [project]=await withPlatform(tx=>tx.query<{name:string}>('SELECT name FROM project WHERE id=$1',[ctx.projectId]));return withTenant(ctx,async tx=>{
  const [pair]=await tx.query<{l:ElementId;r:ElementId;latest_id:string}>(`WITH g AS (${groups}) SELECT l,r,latest_id FROM g WHERE $1=ANY(attempt_ids)`,[id]);if(!pair)return missing();
  // Declaration writers lock their source before the element. Lock every
  // project source in order so membership cannot change during confirmation.
  await tx.query('SELECT id FROM data_source ORDER BY id FOR UPDATE');
  const elements=await tx.query<{id:ElementId;token_domain:string|null;status:string;source_status:string;object_status:string}>(`SELECT e.id,e.token_domain,e.status,o.status AS object_status,s.status AS source_status FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id WHERE e.id=ANY($1::uuid[]) ORDER BY e.id FOR UPDATE OF e`,[[pair.l,pair.r]]);
  const [latest]=await tx.query<{latest_id:string;allowed:boolean}>(`WITH g AS (${groups}) SELECT latest_id,${blocked} AS allowed FROM g WHERE $1=ANY(attempt_ids)`,[id]);
  if(!latest||latest.latest_id!==input.latestAttemptId)return err(new DomainError('conflict','New attempts arrived. Refresh this suggestion before deciding.'));
  let assignments:unknown[]=[];
  if(input.action==='confirm'){
   if(elements.length!==2||elements.some(e=>e.status!=='active'||e.object_status!=='active'||e.source_status==='archived')||!latest.allowed)return err(new DomainError('conflict','Both active columns must be tokenized in every pool that attempted this join. Change the entitlement to tokenized first.'));
   if(input.confirmation!==project?.name)return err(new DomainError('conflict','Type the project name exactly to confirm.'));
   const current=await tx.query<{elementId:string;version:number}>(members,[input.domain]);
   const fingerprint=(v:readonly {elementId:string;version:number}[])=>JSON.stringify(v.map(m=>[m.elementId,m.version]).sort());
   if(fingerprint(current)!==fingerprint(input.members))return err(new DomainError('conflict','Domain membership changed. Review its members again before confirming.'));
   for(const e of elements)if(effectiveTokenDomain(e.token_domain,{projectId:ctx.projectId,elementId:e.id})!==input.domain)await tx.query('UPDATE catalog_element SET token_domain=$2 WHERE id=$1',[e.id,input.domain]);
   assignments=await tx.query('SELECT element_id AS "elementId",max(version)::int AS version FROM token_domain_assignment WHERE element_id=ANY($1::uuid[]) GROUP BY element_id ORDER BY element_id',[[pair.l,pair.r]]);
  }
  await tx.query('INSERT INTO token_join_review(id,project_id,left_element_id,right_element_id,action,actor_id,latest_attempt_id,domain,assignments) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[new UuidV7IdFactory().create(),ctx.projectId,pair.l,pair.r,input.action,ctx.userId,input.latestAttemptId,input.action==='confirm'?input.domain:null,JSON.stringify(assignments)]);
  return ok(undefined);
 });}
}
