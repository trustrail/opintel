import { z } from 'zod';
import { withTenant,withPlatform } from '../../../platform/db/scope.js';
import { DomainError,err,ok,type PoolId,type ElementId,ExposedName,Timestamp } from '../../../shared/kernel/index.js';
import { hydrateCatalogObject,type CatalogObjectRow,type CatalogElementRow } from '../../catalog/index.js';
import type { SourceRef } from '../../sources/index.js';
import type { EntitlementNode } from '../../../shared/api/entitlement-read.js';
import type { EntitlementReader,EntitlementTreeRead } from '../application/read.js';
import type { EntitlementContext } from '../application/entitlement-repository.js';
import { compileViews } from '../application/compile.js';
import { Entitlement,type EntitlementState } from '../domain/entitlement.js';
const missing=()=>err(new DomainError('not_found','The pool or catalogue branch was not found in this project.'));
export class PostgresEntitlementReader implements EntitlementReader {
 pools(ctx:EntitlementContext,after:string|null,limit:number){return withTenant(ctx,async tx=>ok(await tx.query<{id:string;name:string;sourceIds:string[]}>(`SELECT p.id,p.name,ARRAY(SELECT source_id::text FROM pool_source_binding WHERE pool_id=p.id ORDER BY source_id) AS "sourceIds" FROM pool p WHERE ($1::uuid IS NULL OR p.id>$1) ORDER BY p.id LIMIT $2`,[after,limit])));}
 tree(ctx:EntitlementContext,pool:PoolId,q:EntitlementTreeRead){return withTenant(ctx,async tx=>{
  if(!(await tx.query('SELECT id FROM pool WHERE id=$1',[pool])).length)return missing();
  let kind:EntitlementNode['kind']='source',source:string|null=null,schema:string|null=null,object:string|null=null;
  if(q.parent.includes(':')){const split=q.parent.indexOf(':');source=q.parent.slice(0,split);schema=q.parent.slice(split+1);kind='object';if(!z.uuid().safeParse(source).success||!schema)return missing();}
  else if(q.parent){if(!z.uuid().safeParse(q.parent).success)return missing();
   const rows=await tx.query<{source_id:string}>(`SELECT source_id FROM pool_source_binding WHERE pool_id=$1 AND source_id=$2`,[pool,q.parent]);
   if(rows.length){source=q.parent;kind='schema';}else{const [row]=await tx.query<{source_id:string}>(`SELECT o.source_id FROM catalog_object o JOIN pool_source_binding b ON b.source_id=o.source_id AND b.pool_id=$1 WHERE o.id=$2 AND o.status='active'`,[pool,q.parent]);if(!row)return missing();source=row.source_id;object=q.parent;kind='element';}
  }
  const bound=await tx.query('SELECT source_id FROM pool_source_binding b JOIN data_source s ON s.id=b.source_id WHERE b.pool_id=$1 AND ($2::uuid IS NULL OR b.source_id=$2) AND s.status<>\'archived\'',[pool,source]);
  if(source&&(!bound.length||(q.sourceId&&q.sourceId!==source)))return missing();
  type Row={id:string;label:string|null;childCount:number|null;exposedType:string|null;treatment:EntitlementNode['treatment'];maskKind:EntitlementNode['maskKind'];justification:string|null};
  const rows=await tx.query<Row>(`WITH visible AS (
   SELECT e.id,e.exposed_name,e.exposed_type,o.id AS object_id,o.exposed_name AS object_name,o.exposed_schema,s.id AS source_id,s.exposed_alias,
   t.treatment,t.mask_kind,t.justification FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
   JOIN pool_source_binding b ON b.source_id=s.id AND b.pool_id=$1 LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=$1
   WHERE e.status='active' AND o.status='active' AND s.status<>'archived' AND ($2::uuid IS NULL OR s.id=$2) AND (NOT $3::boolean OR t.element_id IS NULL)
  ), nodes AS (
   SELECT source_id::text AS id,exposed_alias AS label,count(DISTINCT exposed_schema)::int AS "childCount",NULL::text AS "exposedType",NULL::text AS treatment,NULL::text AS "maskKind",NULL::text AS justification FROM visible WHERE $4='source' GROUP BY source_id,exposed_alias
   UNION ALL SELECT source_id::text||':'||exposed_schema,exposed_schema,count(DISTINCT object_id)::int,NULL,NULL,NULL,NULL FROM visible WHERE $4='schema' AND source_id=$5::uuid GROUP BY source_id,exposed_schema
   UNION ALL SELECT object_id::text,object_name,count(*)::int,NULL,NULL,NULL,NULL FROM visible WHERE $4='object' AND source_id=$5::uuid AND exposed_schema=$6 GROUP BY object_id,object_name
   UNION ALL SELECT id::text,exposed_name,NULL,exposed_type,treatment,mask_kind,justification FROM visible WHERE $4='element' AND object_id=$7::uuid
  ) SELECT * FROM nodes WHERE ($8='' OR starts_with(label,$8)) AND ($9::text IS NULL OR id COLLATE "C">$9 COLLATE "C") ORDER BY id COLLATE "C" LIMIT $10`,[pool,q.sourceId??null,q.undecided,kind,source,schema,object,q.prefix,q.after,q.limit]);
  return ok(rows.map(row=>({position:row.id,node:{...row,kind}})));
 });}
 async definition(ctx:EntitlementContext,pool:PoolId){
  const [project]=await withPlatform(tx=>tx.query<{version:number;settings:unknown}>('SELECT policy_version AS version,settings FROM project WHERE id=$1',[ctx.projectId]));if(!project)return missing();
  const settings=z.object({query:z.object({aggregateMinGroupSize:z.number().int().positive().default(5)}).default({aggregateMinGroupSize:5})}).safeParse(project.settings);
  if(!settings.success)return err(new DomainError('validation_failed','The project aggregate threshold is invalid.'));
  return withTenant(ctx,async tx=>{
   if(!(await tx.query('SELECT id FROM pool WHERE id=$1',[pool])).length)return missing();
   type Snapshot={sources:Array<Omit<SourceRef,'alias'>&{alias:string}>;objects:CatalogObjectRow[];elements:Array<Omit<CatalogElementRow,'discoveredAt'|'removedAt'>&{discoveredAt:string;removedAt:string|null}>;decisions:Array<Omit<EntitlementState,'setAt'>&{setAt:string}>};
   const [snapshot]=await tx.query<Snapshot>(`WITH sources AS (
    SELECT s.id,s.project_id AS "projectId",s.exposed_alias AS alias,s.kind FROM data_source s JOIN pool_source_binding b ON b.source_id=s.id WHERE b.pool_id=$1 AND s.status<>'archived'
   ), objects AS (
    SELECT o.id,o.project_id AS "projectId",o.source_id AS "sourceId",o.schema_name AS "schemaName",o.object_name AS "objectName",o.object_kind AS kind,o.exposed_schema AS "exposedSchema",o.exposed_name AS "exposedName",o.lineage_known AS "lineageKnown",o.row_estimate AS "rowEstimate",o.description,o.status FROM catalog_object o JOIN sources s ON s.id=o.source_id WHERE o.status='active'
   ), elements AS (
    SELECT e.id,e.project_id AS "projectId",e.object_id AS "objectId",e.source_identifier AS "sourceIdentifier",e.stable_ref AS "stableRef",e.source_type AS "sourceType",e.exposed_type AS "exposedType",e.exposed_name AS "exposedName",e.nullable,e.is_key AS "isKey",e.description,e.status,e.discovered_at AS "discoveredAt",e.removed_at AS "removedAt",e.ordinal,e.token_domain AS "tokenDomain",e.case_insensitive AS "caseInsensitive",e.canon_id AS "canonId",e.source_timezone AS "sourceTimezone",d.source_timezone AS "schemaTimezone",e.epoch_unit AS "epochUnit" FROM catalog_element e JOIN objects o ON o.id=e.object_id LEFT JOIN catalog_schema_temporal d ON d.source_id=o."sourceId" AND d.schema_name=o."schemaName" WHERE e.status='active'
   ), decisions AS (
    SELECT t.pool_id AS "poolId",t.element_id AS "elementId",t.project_id AS "projectId",t.treatment,t.mask_kind AS "maskKind",t.justification,t.set_at AS "setAt",jsonb_build_object('kind',t.source_kind,'id',t.source_ref) AS "setBy" FROM entitlement t JOIN elements e ON e.id=t.element_id WHERE t.pool_id=$1
   ) SELECT COALESCE((SELECT jsonb_agg(s) FROM sources s),'[]') AS sources,COALESCE((SELECT jsonb_agg(o) FROM objects o),'[]') AS objects,COALESCE((SELECT jsonb_agg(e) FROM elements e),'[]') AS elements,COALESCE((SELECT jsonb_agg(t) FROM decisions t),'[]') AS decisions`,[pool]);
   if(!snapshot)throw new Error('Missing catalogue snapshot.');
   const objects=[];for(const row of snapshot.objects){const object=hydrateCatalogObject(row,snapshot.elements.filter(e=>e.objectId===row.id).map(e=>({...e,discoveredAt:new Date(e.discoveredAt),removedAt:e.removedAt===null?null:new Date(e.removedAt)})));if(!object.ok)return object;objects.push(object.value);}
   const decisions=new Map<ElementId,Entitlement>();for(const row of snapshot.decisions){const decision=Entitlement.decide({...row,setAt:Timestamp(new Date(row.setAt))});if(!decision.ok)return decision;decisions.set(row.elementId,decision.value);}
   const compiled=compileViews({poolId:pool,boundSources:snapshot.sources.map(s=>({...s,alias:ExposedName(s.alias)})),objects,elements:objects.flatMap(o=>o.elements),entitlements:decisions,aggregateMinGroupSize:settings.data.query.aggregateMinGroupSize,policyVersion:project.version});
   return compiled.ok?ok({views:compiled.value.views.map(({catalog,schema,name,ddl})=>({catalog,schema,name,ddl})),omitted:[...compiled.value.omitted]}):compiled;
  });
 }
}
