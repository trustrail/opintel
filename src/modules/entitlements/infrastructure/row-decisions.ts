import {predicateWords} from '../../../shared/predicate-words.js';
import {predicate,predicateColumn} from '../../../shared/row-scope-contract.js';
import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {RowDecision,RowDecisionRead,RowDecisionHistory,PoolRowObjects} from '../../../shared/api/row-entitlements.js';
import {hasScope,parsePredicate,predicateHash,referencedColumns} from '../../../shared/row-predicate.js';
import type {PredicateColumn} from '../../../shared/row-scope-contract.js';
import {ok,err,DomainError} from '../../../shared/kernel/index.js';
import type {RowDecisionRepository} from '../application/row-decisions.js';
const projection=`id,expression,predicate_hash AS hash,actor_id AS "actorId",decided_at::text AS "decidedAt",first_scoping AS "firstScoping",level`;
export class PostgresRowDecisions implements RowDecisionRepository{
 constructor(private readonly requireUndecided=false){}
 decision(...[ctx,id]:Parameters<RowDecisionRepository['decision']>){return withTenant(ctx,async tx=>{const [row]=await tx.query(`SELECT ${projection} FROM row_entitlement WHERE id=$1`,[id]);return row?ok(RowDecision.parse(row)):err(new DomainError('not_found','The historical row decision was not found.'));});}
 async objects(...[ctx,pool,filter]:Parameters<RowDecisionRepository['objects']>){const result=await withTenant(ctx,async tx=>{
  const base=`WITH objects AS (
   SELECT o.id,o.exposed_name AS name,s.id AS "sourceId",s.name AS "sourceName",
    CASE WHEN own.id IS NOT NULL THEN 'overridden' WHEN EXISTS(SELECT 1 FROM pool p WHERE p.id=$1 AND p.tables_explicit) THEN 'missing' WHEN def.id IS NOT NULL THEN 'inherited'
     WHEN EXISTS(SELECT 1 FROM row_entitlement d WHERE d.object_id=o.id) THEN 'missing' ELSE 'unscoped' END AS status,
    (def.id IS NOT NULL) AS "hasDefault",own.id AS "decisionId",own.predicate,own.columns,own.actor_id,own.decided_at
   FROM catalog_object o JOIN data_source s ON s.id=o.source_id JOIN pool_source_binding b ON b.source_id=o.source_id
   LEFT JOIN LATERAL(SELECT d.* FROM row_entitlement d WHERE d.object_id=o.id AND d.pool_id=$1 ORDER BY sequence DESC LIMIT 1) own ON true
   LEFT JOIN LATERAL(SELECT d.id FROM row_entitlement d WHERE d.object_id=o.id AND d.level='object_default' ORDER BY sequence DESC LIMIT 1) def ON true
   WHERE b.pool_id=$1 AND public.pool_table_allowed($1,o.id) AND o.status='active' AND s.status<>'archived'
  )`;
  const [counts]=await tx.query(base+` SELECT count(*) FILTER(WHERE status='missing')::int AS missing,count(*) FILTER(WHERE status='overridden')::int AS overridden,count(*) FILTER(WHERE status='inherited')::int AS inherited,count(*) FILTER(WHERE status='unscoped')::int AS unscoped FROM objects`,[pool]);
  const [defaults]=await tx.query<{present:boolean}>(`SELECT EXISTS(SELECT 1 FROM row_entitlement d JOIN catalog_object o ON o.id=d.object_id JOIN data_source s ON s.id=o.source_id WHERE d.level='object_default' AND o.status='active' AND s.status<>'archived') AS present`);
  const projectHasDefault=defaults!.present;
  // "all" is the bounded picker only. Unscoped is count-only on the pool page.
  if(filter.status==='unscoped')return ok(PoolRowObjects.parse({projectHasDefault,counts,items:[],nextCursor:null}));
  const rows=await tx.query<{id:string;name:string;sourceId:string;sourceName:string;status:string;decisionId:string|null;predicate:unknown;columns:unknown;actorName:string;decidedAt:string}>(base+` SELECT o.*,o.actor_id::text AS "actorName",o.decided_at::text AS "decidedAt" FROM objects o WHERE ($2='all' OR o.status=$2) AND strpos(lower(o.name),lower($3))>0 AND ($4::uuid IS NULL OR o.id>$4) ORDER BY o.id LIMIT 51`,[pool,filter.status,filter.search,filter.cursor??null]);
  return ok(PoolRowObjects.parse({projectHasDefault,counts,items:rows.slice(0,50).map(o=>({...o,decision:o.decisionId?{id:o.decisionId,words:predicateWords(predicate.parse(o.predicate),predicateColumn.array().parse(o.columns)),actorName:o.actorName,decidedAt:o.decidedAt}:null})),nextCursor:rows.length>50?rows[49]!.id:null}));
 });
  if(!result.ok)return result;
  const ids=[...new Set(result.value.items.flatMap(o=>o.decision?[o.decision.actorName]:[]))];
  const actors=ids.length?await withPlatform(tx=>tx.query<{id:string;name:string}>('SELECT id,COALESCE(full_name,email) AS name FROM user_account WHERE id=ANY($1::uuid[])',[ids])):[];
  const names=new Map(actors.map(actor=>[actor.id,actor.name]));
  return ok({...result.value,items:result.value.items.map(o=>({...o,decision:o.decision?{...o.decision,actorName:names.get(o.decision.actorName)??o.decision.actorName}:null}))});
 }

 history(...[ctx,pool,object,cursor]:Parameters<RowDecisionRepository['history']>){return withTenant(ctx,async tx=>{
  const rows=await tx.query<{sequence:string}>(`SELECT ${projection},sequence::text FROM row_entitlement WHERE object_id=$1 AND (pool_id=$2 OR level='object_default') AND ($3::bigint IS NULL OR sequence<$3) ORDER BY sequence DESC LIMIT 51`,[object,pool,cursor??null]);
  return ok(RowDecisionHistory.parse({items:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.sequence:null}));
 });}

 read(...[ctx,pool,object]:Parameters<RowDecisionRepository['read']>){return withTenant(ctx,async tx=>{
  const [o]=await tx.query<{name:string}>(`SELECT o.exposed_name AS name FROM catalog_object o JOIN pool_source_binding b ON b.source_id=o.source_id AND b.pool_id=$2 WHERE o.id=$1 AND public.pool_table_allowed($2,o.id) AND o.status='active'`,[object,pool]);
  if(!o)return err(new DomainError('not_found','The object is not bound to this pool.'));
  const columns=await tx.query<PredicateColumn>(`SELECT id,exposed_name AS name,source_identifier AS "sourceIdentifier",exposed_type AS type FROM catalog_element WHERE object_id=$1 AND status='active' AND exposed_name IS NOT NULL AND exposed_type IS NOT NULL ORDER BY ordinal`,[object]);
  const [current]=await tx.query(`SELECT ${projection} FROM row_entitlement WHERE object_id=$1 AND pool_id=$2 ORDER BY sequence DESC LIMIT 1`,[object,pool]);
  const [objectDefault]=await tx.query(`SELECT ${projection} FROM row_entitlement WHERE object_id=$1 AND level='object_default' ORDER BY sequence DESC LIMIT 1`,[object]);
  const pools=await tx.query<{id:string;name:string;hasOverride:boolean;explicit:boolean}>(`SELECT p.id,p.name,p.tables_explicit AS explicit,EXISTS(SELECT 1 FROM row_entitlement d WHERE d.object_id=$1 AND d.pool_id=p.id) AS "hasOverride" FROM pool p JOIN pool_source_binding b ON b.pool_id=p.id JOIN catalog_object o ON o.source_id=b.source_id WHERE o.id=$1 AND public.pool_table_allowed(p.id,o.id) ORDER BY p.name,p.id`,[object]);
  const strict=(await tx.query('SELECT id FROM pool WHERE id=$1 AND tables_explicit',[pool])).length>0;
  const scoped=strict||(await tx.query('SELECT id FROM row_entitlement WHERE object_id=$1 LIMIT 1',[object])).length>0;
  return ok(RowDecisionRead.parse({objectId:object,objectName:o.name,poolId:pool,scoped,columns,current:current??null,objectDefault:objectDefault??null,effectiveExpression:strict&&!current?null:[objectDefault,current].filter(Boolean).map(d=>'('+RowDecision.parse(d).expression+')').join(' AND ')||null,pools:pools.map(p=>({id:p.id,name:p.name,status:p.hasOverride?'overridden':p.explicit?'missing':objectDefault?'inherited':scoped?'missing':'unscoped'}))}));
 });}
 save(...[ctx,pool,object,expression,level='pool_override']:Parameters<RowDecisionRepository['save']>){return withTenant(ctx,async tx=>{
  const source=await tx.query(`SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id JOIN pool_source_binding b ON b.source_id=s.id AND b.pool_id=$2 WHERE o.id=$1 AND public.pool_table_allowed($2,o.id) AND o.status='active' AND s.status<>'archived' FOR UPDATE OF s`,[object,pool]);
  if(!source.length)return err(new DomainError('not_found','The object is not bound to this pool.'));
  if(this.requireUndecided&&(await tx.query("SELECT 1 FROM row_entitlement WHERE object_id=$1 AND (pool_id=$2 OR level='object_default') LIMIT 1",[object,pool])).length)return err(new DomainError('conflict','A row decision was recorded during provisioning; it was not replaced.'));
  const columns=await tx.query<PredicateColumn>(`SELECT id,exposed_name AS name,source_identifier AS "sourceIdentifier",exposed_type AS type FROM catalog_element WHERE object_id=$1 AND status='active' AND exposed_name IS NOT NULL AND exposed_type IS NOT NULL ORDER BY ordinal FOR SHARE`,[object]);
  const parsed=parsePredicate(expression,columns);if(!parsed.ok)return parsed;
  if(hasScope(parsed.value))return err(new DomainError('validation_failed','scope references arrive in step 3'));
  const inputs=columns.filter(c=>referencedColumns(parsed.value).includes(c.id));
  const [row]=await tx.query(`INSERT INTO row_entitlement(project_id,object_id,pool_id,expression,predicate,predicate_hash,columns,actor_id,level) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${projection}`,[ctx.projectId,object,level==='object_default'?null:pool,expression,JSON.stringify(parsed.value),predicateHash(parsed.value),JSON.stringify(inputs),ctx.userId,level]);
  return ok(RowDecision.parse(row));
 });}
}
