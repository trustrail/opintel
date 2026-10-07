import {withTenant} from '../../../platform/db/scope.js';
import {ok,err,DomainError,type PoolId} from '../../../shared/kernel/index.js';
import {GroupPage,MemberPage,type GroupFilter,type MemberFilter} from '../../../shared/api/entitlement-groups.js';
import type {EntitlementContext} from '../application/entitlement-repository.js';
// Filters apply to members before grouping. Null names stay separate by identity.
const visible=(elementParameter:string)=>`SELECT e.id,e.exposed_name AS name,e.exposed_type AS "exposedType",e.source_type AS "sourceType",o.id AS "objectId",o.exposed_name AS "objectLabel",o.source_id AS "sourceId",
 concat_ws('.',s.exposed_alias,o.exposed_schema,o.exposed_name) AS "objectName",concat_ws('.',s.exposed_alias,o.exposed_schema,o.exposed_name,COALESCE(e.exposed_name,'[unnameable element]')) AS "qualifiedName",
 CASE WHEN $5='table' THEN 'table:'||o.id::text WHEN e.exposed_name IS NULL THEN 'element:'||e.id::text ELSE 'name:'||e.exposed_name END AS "group",
 t.treatment,t.mask_kind AS "maskKind",t.justification FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
 JOIN pool_source_binding b ON b.source_id=s.id AND b.pool_id=$1 LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=$1
 WHERE e.status='active' AND o.status='active' AND s.status<>'archived' AND ($2::uuid IS NULL OR s.id=$2)
 AND ($3='' OR starts_with(e.exposed_name,$3)) AND (${elementParameter}::uuid IS NULL OR e.id=${elementParameter})`;
const filtered=`SELECT * FROM visible WHERE $4='all' OR ($4='undecided' AND treatment IS NULL) OR ($4='decided' AND treatment IS NOT NULL)`;
const counts=(table:string)=>`SELECT jsonb_agg(jsonb_build_object('value',value,'count',n) ORDER BY value) FROM (SELECT COALESCE(treatment,'undecided') AS value,count(*)::int AS n FROM ${table} GROUP BY treatment)c`;
export class PostgresGroupedEntitlements {
 groups(ctx:EntitlementContext,pool:PoolId,q:GroupFilter,after:string|null,limit:number){return withTenant(ctx,async tx=>{
  if(!(await tx.query('SELECT id FROM pool WHERE id=$1',[pool])).length)return err(new DomainError('not_found','The pool was not found in this project.'));
  const [result]=await tx.query<{items:unknown;totals:unknown}>(`WITH visible AS (${visible('$8')}), filtered AS (${filtered}), grouped AS (
   SELECT f."group" AS "groupKey",CASE WHEN $5='table' THEN min(f."objectName") ELSE COALESCE(min(f.name),'Unnameable element') END AS name,count(*)::int AS count,count(DISTINCT f."objectId")::int AS objects,
   (SELECT jsonb_agg(jsonb_build_object('value',v."exposedType",'count',v.n) ORDER BY v."exposedType") FROM (SELECT x."exposedType",count(*)::int n FROM filtered x WHERE x."group"=f."group" GROUP BY x."exposedType")v) AS types,
   (SELECT jsonb_agg(jsonb_build_object('value',d.value,'count',d.n) ORDER BY d.value) FROM (SELECT COALESCE(x.treatment,'undecided') value,count(*)::int n FROM filtered x WHERE x."group"=f."group" GROUP BY x.treatment)d) AS decisions,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('value',m."maskKind",'count',m.n) ORDER BY m."maskKind") FROM (SELECT x."maskKind",count(*)::int n FROM filtered x WHERE x."group"=f."group" AND x.treatment='masked' GROUP BY x."maskKind")m),'[]') AS "maskKinds",
   (SELECT count(*)::int FROM token_join_candidate c WHERE c.pool_id=$1 AND c.operation='query' AND EXISTS(SELECT 1 FROM filtered x WHERE x."group"=f."group" AND x.id IN(c.left_element_id,c.right_element_id))) AS queries,
   (SELECT count(*)::int FROM token_join_candidate c WHERE c.pool_id=$1 AND c.operation='explain' AND EXISTS(SELECT 1 FROM filtered x WHERE x."group"=f."group" AND x.id IN(c.left_element_id,c.right_element_id))) AS explains
   FROM filtered f GROUP BY f."group"
  ), page AS (SELECT * FROM grouped WHERE $6::text IS NULL OR "groupKey" COLLATE "C">$6 COLLATE "C" ORDER BY "groupKey" COLLATE "C" LIMIT $7)
  SELECT COALESCE((SELECT jsonb_agg(p ORDER BY p."groupKey" COLLATE "C") FROM page p),'[]') AS items,
   jsonb_build_object('members',(SELECT count(*)::int FROM filtered),'groups',(SELECT count(*)::int FROM grouped),'undecided',(SELECT count(*)::int FROM visible WHERE treatment IS NULL),'decisions',COALESCE((${counts('visible')}),'[]')) AS totals`,[pool,q.sourceId??null,q.prefix,q.decision,q.mode,after,limit+1,q.elementId??null]);
  if(!result)throw new Error('Missing grouped entitlement read.');
  const parsed=GroupPage.parse({...result,nextCursor:null}),items=parsed.items.slice(0,limit);
  return ok({...parsed,items,nextCursor:parsed.items.length>limit?items.at(-1)!.groupKey:null});
 });}
 members(ctx:EntitlementContext,pool:PoolId,q:MemberFilter,after:string|null,limit:number){return withTenant(ctx,async tx=>{
  if(!(await tx.query('SELECT id FROM pool WHERE id=$1',[pool])).length)return err(new DomainError('not_found','The pool was not found in this project.'));
  const rows=await tx.query(`WITH visible AS (${visible('$9')}),filtered AS (${filtered}) SELECT * FROM filtered WHERE ($6::text IS NULL OR "group"=$6) AND ($7::uuid IS NULL OR id>$7) ORDER BY id LIMIT $8`,[pool,q.sourceId??null,q.prefix,q.decision,q.mode,q.group??null,after,limit+1,q.elementId??null]);
  const parsed=MemberPage.parse({items:rows,nextCursor:null}),items=parsed.items.slice(0,limit);return ok({items,nextCursor:parsed.items.length>limit?items.at(-1)!.id:null});
 });}
}
