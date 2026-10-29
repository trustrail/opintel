import {z} from 'zod';
import {withTenant,type Tx} from '../../../platform/db/scope.js';
import {DomainError,err,ok,PoolId,SourceId,type ObjectId,type Result,type ElementId} from '../../../shared/kernel/index.js';
import {predicateColumn} from '../../../shared/row-scope-contract.js';
import {PoolTableSetup,PoolRowRule,BoundPoolTable} from '../../../shared/api/pool-tables.js';
import {validateCopiedTreatment,type RuleElement,type Treatment,type MaskKind} from '../../entitlements/index.js';
import {custodyAvailability} from '../../release-custody/index.js';
import {RelationshipOutbox} from '../../tenancy/index.js';
import type {AuthorizationPort} from '../../authz/index.js';
import type {PoolKeyContext} from '../application/keys.js';
import {poolTableSelection,type PoolTableSelection,type PoolTablesPort} from '../application/tables.js';
import {compilePoolRowRule} from '../application/row-rule.js';
type Table={id:ObjectId;sourceId:SourceId;name:string;columns:z.infer<typeof predicateColumn>[];rule:ReturnType<typeof compilePoolRowRule>};
type Prepared={setup:PoolTableSelection;tables:Table[]};
const missing=()=>err(new DomainError('not_found','The pool and active tables must belong to this project.'));
const projection=`b.object_id AS "objectId",o.source_id AS "sourceId",o.exposed_name AS name,
 NOT EXISTS(SELECT 1 FROM row_entitlement r WHERE r.object_id=o.id AND r.pool_id=b.pool_id AND r.level='pool_override') AS "needsRows",
 CASE WHEN EXISTS(SELECT 1 FROM row_entitlement r WHERE r.object_id=o.id AND r.pool_id=b.pool_id AND r.level='pool_override') THEN NULL ELSE COALESCE(b.row_rule_reason,'rule_required') END AS reason`;
export class PostgresPoolTables implements PoolTablesPort{
 constructor(private readonly outbox=new RelationshipOutbox(),private readonly authorization?:AuthorizationPort){}
 async prepare(tx:Tx,setup:PoolTableSelection):Promise<Result<Prepared>>{
  const sources=await tx.query(`SELECT id FROM data_source WHERE id IN(SELECT source_id FROM catalog_object WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE`,[setup.tables]);
  void sources;
  if(setup.startingMode.kind==='copy_from'&&!(await tx.query('SELECT id FROM pool WHERE id=$1 FOR SHARE',[setup.startingMode.poolId])).length)return missing();
  const objects=await tx.query<{id:ObjectId;sourceId:SourceId;name:string}>(`SELECT o.id,o.source_id AS "sourceId",o.exposed_name AS name FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.id=ANY($1::uuid[]) AND o.status='active' AND s.status<>'archived' ORDER BY o.id FOR UPDATE OF o`,[setup.tables]);
  if(objects.length!==setup.tables.length)return missing();
  const tables:Table[]=[];
  for(const object of objects){const columns=predicateColumn.array().parse(await tx.query(`SELECT id,exposed_name AS name,source_identifier AS "sourceIdentifier",exposed_type AS type FROM catalog_element WHERE object_id=$1 AND status='active' AND exposed_name IS NOT NULL AND exposed_type IS NOT NULL ORDER BY ordinal FOR SHARE`,[object.id]));tables.push({...object,columns,rule:compilePoolRowRule(setup.rowRule,columns)});}
  return ok({setup,tables});
 }
 async apply(tx:Tx,ctx:PoolKeyContext,pool:PoolId,prepared:Prepared){
  const tables:z.infer<typeof BoundPoolTable>[]=[],outbox:bigint[]=[];
  let custodyAvailable:boolean|undefined;
  for(const source of [...new Set(prepared.tables.map(t=>t.sourceId))].sort()){
   const inserted=await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING pool_id',[pool,source,ctx.projectId]);
   if(inserted.length)outbox.push(...await this.outbox.enqueuePoolBinding(tx,pool,source,true));
  }
  for(const table of prepared.tables){
   const added=await tx.query('INSERT INTO pool_table_binding(project_id,pool_id,object_id,row_rule_reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING object_id',[ctx.projectId,pool,table.id,table.rule.ok?null:table.rule.reason]);
   const existing=await tx.query("SELECT id FROM row_entitlement WHERE pool_id=$1 AND object_id=$2 AND level='pool_override' LIMIT 1",[pool,table.id]);
   if(!existing.length&&table.rule.ok)await this.saveRule(tx,ctx,pool,table.id,table.rule);
   let copied=0,skipped=0;
   if(added.length&&prepared.setup.startingMode.kind==='copy_from'){
    const columns=await tx.query<RuleElement&{hasContributor:boolean;treatment:Treatment|null;maskKind:MaskKind|null;ambiguous:boolean}>(`SELECT e.id,e.exposed_name AS "exposedName",e.exposed_type AS "exposedType",o.exposed_schema AS "exposedSchema",e.token_domain AS "tokenDomain",e.case_insensitive AS "caseInsensitive",e.canon_id AS "canonId",COALESCE(e.source_timezone,d.source_timezone) AS "sourceTimezone",e.epoch_unit AS "epochUnit",
     EXISTS(SELECT 1 FROM catalog_element k WHERE k.object_id=o.id AND k.status='active' AND k.contributor_key AND k.exposed_type IN('VARCHAR','UUID','TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT','DATE','TIMESTAMP','TIMESTAMPTZ')) AS "hasContributor",
     match.treatment,match.mask_kind AS "maskKind",match.ambiguous
     FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id LEFT JOIN catalog_schema_temporal d ON d.source_id=o.source_id AND d.schema_name=o.schema_name
     LEFT JOIN LATERAL(SELECT min(t.treatment) AS treatment,min(t.mask_kind) AS mask_kind,count(*)<>count(t.element_id) OR count(DISTINCT (t.treatment,t.mask_kind))<>1 AS ambiguous
      FROM catalog_element x JOIN catalog_object other ON other.id=x.object_id JOIN pool_source_binding source_binding ON source_binding.pool_id=$2 AND source_binding.source_id=other.source_id JOIN data_source source ON source.id=other.source_id LEFT JOIN entitlement t ON t.element_id=x.id AND t.pool_id=$2
      WHERE other.exposed_name=o.exposed_name AND x.exposed_name=e.exposed_name AND x.status='active' AND other.status='active' AND source.status<>'archived' AND public.pool_table_allowed($2,other.id))match ON true
     WHERE e.object_id=$1 AND e.status='active' ORDER BY e.id`,[table.id,prepared.setup.startingMode.poolId]);
    for(const column of columns){
     if(!column.treatment||column.ambiguous||!validateCopiedTreatment({treatment:column.treatment,maskKind:column.maskKind},column).ok||column.treatment==='aggregate_only'&&!column.hasContributor){skipped++;continue;}
     if(column.treatment==='custody'){custodyAvailable??=(await custodyAvailability(ctx.projectId)).available;if(!custodyAvailable){skipped++;continue;}}
     const present=await tx.query('SELECT element_id FROM entitlement WHERE pool_id=$1 AND element_id=$2',[pool,column.id]);if(present.length)continue;
     await tx.query(`INSERT INTO entitlement(project_id,pool_id,element_id,treatment,mask_kind,source_kind,source_ref,justification) VALUES($1,$2,$3,$4,$5,'user',$6,'Copied column treatment by explicit pool creation decision')`,[ctx.projectId,pool,column.id as ElementId,column.treatment,column.maskKind,ctx.userId]);copied++;
    }
   }
   const [row]=await tx.query(`SELECT ${projection} FROM pool_table_binding b JOIN catalog_object o ON o.id=b.object_id WHERE b.pool_id=$1 AND b.object_id=$2`,[pool,table.id]);
   tables.push({...BoundPoolTable.parse(row),copiedColumns:copied,skippedColumns:skipped});
  }
  await tx.query("INSERT INTO audit_entry(project_id,actor_id,actor_kind,action,target,after) VALUES($1,$2,'user','PoolTablesBound',$3,$4)",[ctx.projectId,ctx.userId,{poolId:pool},{objectIds:prepared.tables.map(t=>t.id)}]);
  return {poolId:pool,tables,outbox};
 }
 private async saveRule(tx:Tx,ctx:PoolKeyContext,pool:PoolId,object:ObjectId,rule:Extract<ReturnType<typeof compilePoolRowRule>,{ok:true}>){
  await tx.query(`INSERT INTO row_entitlement(project_id,object_id,pool_id,expression,predicate,predicate_hash,columns,actor_id,level) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pool_override')`,[ctx.projectId,object,pool,rule.expression,JSON.stringify(rule.predicate),rule.hash,JSON.stringify(rule.columns),ctx.userId]);
 }
 async dispatch(ids:readonly bigint[]){if(!this.authorization)return;for(const id of ids)if(await this.outbox.dispatchOne(this.authorization,id)===null)throw new DomainError('dependency_unavailable','The table decision was saved; source authorization is pending.',undefined,true);}
 list(ctx:PoolKeyContext,pool:PoolId,cursor:string|null,limit:number){return withTenant(ctx,async tx=>{
  if(!(await tx.query('SELECT id FROM pool WHERE id=$1',[pool])).length)return missing();
  const rows=await tx.query(`SELECT ${projection} FROM pool_table_binding b JOIN catalog_object o ON o.id=b.object_id WHERE b.pool_id=$1 AND ($2::uuid IS NULL OR b.object_id>$2) ORDER BY b.object_id LIMIT $3`,[pool,cursor,limit+1]);
  const items=rows.slice(0,limit).map(row=>BoundPoolTable.parse(row));return ok({items,nextCursor:rows.length>limit?items.at(-1)!.objectId:null});
 });}
 async add(ctx:PoolKeyContext,pool:PoolId,objects:readonly ObjectId[],rule?:PoolRowRule){
  const saved=await withTenant(ctx,async tx=>{
   const [p]=await tx.query<{table_setup:unknown}>('SELECT table_setup FROM pool WHERE id=$1',[pool]);if(!p)return missing();
   const stored=PoolTableSetup.omit({tables:true}).safeParse(p.table_setup);if(!rule&&!stored.success)return err(new DomainError('validation_failed','Supply an explicit row rule for this pool.'));
   const setup=poolTableSelection({tables:[...objects],rowRule:rule??stored.data!.rowRule,startingMode:stored.success?stored.data.startingMode:{kind:'nothing_yet'}});
   const prepared=await this.prepare(tx,setup);if(!prepared.ok)return prepared;
   const [current]=await tx.query<{tables_explicit:boolean}>('SELECT tables_explicit FROM pool WHERE id=$1 FOR UPDATE',[pool]);if(!current)return missing();
   if(!current.tables_explicit){
    await tx.query(`INSERT INTO pool_table_binding(project_id,pool_id,object_id,row_rule_reason) SELECT $1,$2,o.id,'rule_required' FROM catalog_object o JOIN pool_source_binding b ON b.source_id=o.source_id WHERE b.pool_id=$2 AND o.status='active' ON CONFLICT DO NOTHING`,[ctx.projectId,pool]);
    await tx.query('UPDATE pool SET tables_explicit=true,table_setup=$2 WHERE id=$1',[pool,JSON.stringify({rowRule:setup.rowRule,startingMode:setup.startingMode})]);
   }
   return ok(await this.apply(tx,ctx,pool,prepared.value));
  });
  if(!saved.ok)return saved;await this.dispatch(saved.value.outbox);return ok({poolId:saved.value.poolId,tables:saved.value.tables});
 }
 async remove(ctx:PoolKeyContext,pool:PoolId,object:ObjectId){
  const saved=await withTenant(ctx,async tx=>{
   const [source]=await tx.query<{id:SourceId}>('SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id WHERE o.id=$1 FOR UPDATE OF s',[object]);if(!source)return missing();
   const [p]=await tx.query<{tables_explicit:boolean}>('SELECT tables_explicit FROM pool WHERE id=$1 FOR UPDATE',[pool]);if(!p)return missing();
   if(!p.tables_explicit){await tx.query(`INSERT INTO pool_table_binding(project_id,pool_id,object_id,row_rule_reason) SELECT $1,$2,o.id,'rule_required' FROM catalog_object o JOIN pool_source_binding b ON b.source_id=o.source_id WHERE b.pool_id=$2 AND o.status='active' ON CONFLICT DO NOTHING`,[ctx.projectId,pool]);await tx.query('UPDATE pool SET tables_explicit=true WHERE id=$1',[pool]);}
   await tx.query('DELETE FROM pool_table_binding WHERE pool_id=$1 AND object_id=$2',[pool,object]);
   const outbox:bigint[]=[];
   if(!(await tx.query('SELECT b.object_id FROM pool_table_binding b JOIN catalog_object o ON o.id=b.object_id WHERE b.pool_id=$1 AND o.source_id=$2 LIMIT 1',[pool,source.id])).length){await tx.query('DELETE FROM pool_source_binding WHERE pool_id=$1 AND source_id=$2',[pool,source.id]);outbox.push(...await this.outbox.enqueuePoolBinding(tx,pool,source.id,false));}
   await tx.query("INSERT INTO audit_entry(project_id,actor_id,actor_kind,action,target) VALUES($1,$2,'user','PoolTableRemoved',$3)",[ctx.projectId,ctx.userId,{poolId:pool,objectId:object}]);return ok(outbox);
  });if(!saved.ok)return saved;await this.dispatch(saved.value);return ok(undefined);
 }
 rows(ctx:PoolKeyContext,pool:PoolId,object:ObjectId,rule:PoolRowRule){return withTenant(ctx,async tx=>{
  const prepared=await this.prepare(tx,{tables:[object],rowRule:rule,startingMode:{kind:'nothing_yet'}});if(!prepared.ok)return prepared;
  if(!(await tx.query('SELECT pool_id FROM pool_table_binding WHERE pool_id=$1 AND object_id=$2 FOR UPDATE',[pool,object])).length)return missing();
  const table=prepared.value.tables[0]!;if(!table.rule.ok)return err(new DomainError('validation_failed','The table row rule does not match a supported column and type.',{reason:table.rule.reason}));
  await this.saveRule(tx,ctx,pool,object,table.rule);await tx.query('UPDATE pool_table_binding SET row_rule_reason=NULL WHERE pool_id=$1 AND object_id=$2',[pool,object]);
  return ok(BoundPoolTable.parse({objectId:object,sourceId:table.sourceId,name:table.name,needsRows:false,reason:null}));
 });}
}
