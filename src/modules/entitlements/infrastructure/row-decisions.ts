import {withTenant} from '../../../platform/db/scope.js';
import {RowDecision,RowDecisionRead,RowDecisionHistory} from '../../../shared/api/row-entitlements.js';
import {hasScope,parsePredicate,predicateHash,referencedColumns} from '../../../shared/row-predicate.js';
import type {PredicateColumn} from '../../../shared/row-scope-contract.js';
import {ok,err,DomainError} from '../../../shared/kernel/index.js';
import type {RowDecisionRepository} from '../application/row-decisions.js';
const projection=`id,expression,predicate_hash AS hash,actor_id AS "actorId",decided_at::text AS "decidedAt",first_scoping AS "firstScoping"`;
export class PostgresRowDecisions implements RowDecisionRepository{
 history(...[ctx,pool,object,cursor]:Parameters<RowDecisionRepository['history']>){return withTenant(ctx,async tx=>{
  const rows=await tx.query<{sequence:string}>(`SELECT ${projection},sequence::text FROM row_entitlement WHERE object_id=$1 AND pool_id=$2 AND ($3::bigint IS NULL OR sequence<$3) ORDER BY sequence DESC LIMIT 51`,[object,pool,cursor??null]);
  return ok(RowDecisionHistory.parse({items:rows.slice(0,50),nextCursor:rows.length>50?rows[49]!.sequence:null}));
 });}

 read(...[ctx,pool,object]:Parameters<RowDecisionRepository['read']>){return withTenant(ctx,async tx=>{
  const [o]=await tx.query<{name:string}>(`SELECT o.exposed_name AS name FROM catalog_object o JOIN pool_source_binding b ON b.source_id=o.source_id AND b.pool_id=$2 WHERE o.id=$1 AND o.status='active'`,[object,pool]);
  if(!o)return err(new DomainError('not_found','The object is not bound to this pool.'));
  const columns=await tx.query<PredicateColumn>(`SELECT id,exposed_name AS name,source_identifier AS "sourceIdentifier",exposed_type AS type FROM catalog_element WHERE object_id=$1 AND status='active' AND exposed_name IS NOT NULL AND exposed_type IS NOT NULL ORDER BY ordinal`,[object]);
  const [current]=await tx.query(`SELECT ${projection} FROM row_entitlement WHERE object_id=$1 AND pool_id=$2 ORDER BY sequence DESC LIMIT 1`,[object,pool]);
  const scoped=(await tx.query('SELECT id FROM row_entitlement WHERE object_id=$1 LIMIT 1',[object])).length>0;
  return ok(RowDecisionRead.parse({objectId:object,objectName:o.name,poolId:pool,scoped,columns,current:current??null}));
 });}
 save(...[ctx,pool,object,expression]:Parameters<RowDecisionRepository['save']>){return withTenant(ctx,async tx=>{
  const source=await tx.query(`SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id JOIN pool_source_binding b ON b.source_id=s.id AND b.pool_id=$2 WHERE o.id=$1 AND o.status='active' AND s.status<>'archived' FOR UPDATE OF s`,[object,pool]);
  if(!source.length)return err(new DomainError('not_found','The object is not bound to this pool.'));
  const columns=await tx.query<PredicateColumn>(`SELECT id,exposed_name AS name,source_identifier AS "sourceIdentifier",exposed_type AS type FROM catalog_element WHERE object_id=$1 AND status='active' AND exposed_name IS NOT NULL AND exposed_type IS NOT NULL ORDER BY ordinal FOR SHARE`,[object]);
  const parsed=parsePredicate(expression,columns);if(!parsed.ok)return parsed;
  if(hasScope(parsed.value))return err(new DomainError('validation_failed','scope references arrive in step 3'));
  const inputs=columns.filter(c=>referencedColumns(parsed.value).includes(c.id));
  const [row]=await tx.query(`INSERT INTO row_entitlement(project_id,object_id,pool_id,expression,predicate,predicate_hash,columns,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${projection}`,[ctx.projectId,object,pool,expression,JSON.stringify(parsed.value),predicateHash(parsed.value),JSON.stringify(inputs),ctx.userId]);
  return ok(RowDecision.parse(row));
 });}
}
