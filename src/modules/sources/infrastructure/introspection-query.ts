import { withTenant,type Tx } from '../../../platform/db/scope.js';
import { DomainError,err,ok,type Result,type RunId,type SourceId } from '../../../shared/kernel/index.js';
import { IntrospectionRunView,type RunView } from '../../../shared/api/introspection.js';
import type { IntrospectionQuery } from '../application/introspection-query.js';
import type { IntrospectionContext,IntrospectionStore } from '../application/introspection-store.js';
import type { IntrospectionDiff } from '../../catalog/index.js';

type Row={id:RunId;sourceId:SourceId;state:RunView['state'];progress:{objects?:number;total?:number|null};error:string|null;startedAt:Date|null;endedAt:Date|null;diff:IntrospectionDiff[]};
const select=`SELECT id,source_id AS "sourceId",state,progress,error,started_at AS "startedAt",ended_at AS "endedAt",diff FROM introspection_run`;
const missing=()=>err(new DomainError('not_found','Introspection run or source was not found.'));
export class PostgresIntrospectionQuery implements IntrospectionQuery {
 constructor(private readonly store:Pick<IntrospectionStore,'cancel'>){}
 private async view(tx:Tx,row:Row):Promise<RunView>{
  const legacyIds=[...new Set(row.diff.filter(entry=>!('exposedName'in entry)).map(entry=>entry.elementId??entry.objectId))];
  const names=legacyIds.length?await tx.query<{id:string;name:string|null}>(`SELECT e.id,e.exposed_name AS name FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id WHERE o.source_id=$1 AND e.id=ANY($2::uuid[]) UNION ALL SELECT id,exposed_name FROM catalog_object WHERE source_id=$1 AND id=ANY($2::uuid[])`,[row.sourceId,legacyIds]):[];
  const diff=row.state==='complete'?row.diff.map(entry=>{
   const type=entry.type;
   const change=type==='CatalogElementOrdinalChanged'?'ordinal_changed':type==='CatalogNameCollision'?'collision':type.includes('Removed')?'removed':type.includes('Renamed')||type==='CatalogNameAdopted'?'renamed':type.includes('Type')||type==='CatalogElementChanged'?'type_changed':'added';
   return {change,elementId:entry.elementId??null,exposedName:'exposedName'in entry?entry.exposedName??null:names.find(n=>n.id===(entry.elementId??entry.objectId))?.name??null,
    before:entry.before??('beforeType'in entry?entry.beforeType:null)??null,after:entry.after??('afterType'in entry?entry.afterType:null)??null,
    breaking:('requiresEntitlementDeletion'in entry&&entry.requiresEntitlementDeletion===true)||('breaking'in entry&&entry.breaking===true)};
  }):null;
  return IntrospectionRunView.parse({...row,startedAt:row.startedAt?.toISOString()??null,endedAt:row.endedAt?.toISOString()??null,progress:{objects:row.progress.objects??0,total:row.progress.total??null},diff});
 }
 read(ctx:IntrospectionContext,id:RunId):Promise<Result<RunView>>{return withTenant(ctx,async tx=>{const [row]=await tx.query<Row>(`${select} WHERE id=$1`,[id]);return row?ok(await this.view(tx,row)):missing();});}
 list(ctx:IntrospectionContext,source:SourceId,after:RunId|null,limit:number):Promise<Result<RunView[]>>{return withTenant(ctx,async tx=>{
  const found=await tx.query('SELECT id FROM data_source WHERE id=$1',[source]);if(!found.length)return missing();
  const rows=await tx.query<Row>(`${select} WHERE source_id=$1 AND ($2::uuid IS NULL OR id<$2) ORDER BY id DESC LIMIT $3`,[source,after,limit]);
  return ok(await Promise.all(rows.map(row=>this.view(tx,row))));
 });}
 async cancel(ctx:IntrospectionContext,id:RunId){const result=await this.store.cancel(ctx,id,true);return result.ok?this.read(ctx,id):result;}
}
