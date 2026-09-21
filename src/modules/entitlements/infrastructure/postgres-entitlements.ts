import { withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok, type PoolId, type ElementId } from '../../../shared/kernel/index.js';
import type { EntitlementRepository, EntitlementContext } from '../application/entitlement-repository.js';
import type { Entitlement, Treatment } from '../domain/entitlement.js';
const active = `FROM entitlement t JOIN catalog_element e ON e.id=t.element_id JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id WHERE t.pool_id=$1 AND e.status='active' AND o.status='active' AND s.status<>'archived'`;
export class PostgresEntitlements implements EntitlementRepository {
 set(ctx: EntitlementContext, decision: Entitlement) {
  const s=decision.state;
  if(s.projectId!==ctx.projectId)return Promise.resolve(err(new DomainError('forbidden','The entitlement belongs to another project.')));
  return withTenant(ctx,async tx=>{
   // Share the source/element locks used by archive and introspection so an
   // old decision cannot race a type-family invalidation or source archive.
   const source=await tx.query(`SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id JOIN catalog_element e ON e.object_id=o.id WHERE e.id=$1 AND s.status<>'archived' FOR UPDATE OF s`,[s.elementId]);
   if(!source.length)return err(new DomainError('not_found','An active catalogue element is required.'));
   const rows=await tx.query(`SELECT e.id FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id WHERE e.id=$1 AND e.status='active' AND o.status='active' AND s.status<>'archived' FOR UPDATE OF e`,[s.elementId]);
   if(!rows.length)return err(new DomainError('not_found','An active catalogue element is required.'));
   const pools=await tx.query('SELECT id FROM pool WHERE id=$1',[s.poolId]);
   if(!pools.length)return err(new DomainError('not_found','The pool was not found in this project.'));
   await tx.query(`INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref,justification,set_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(pool_id,element_id) DO UPDATE SET treatment=EXCLUDED.treatment,source_kind=EXCLUDED.source_kind,source_ref=EXCLUDED.source_ref,justification=EXCLUDED.justification,set_at=EXCLUDED.set_at`,[s.poolId,s.elementId,s.projectId,s.treatment,s.setBy.kind,s.setBy.id,s.justification,s.setAt]);
   return ok(undefined);
  });
 }
 forPool(ctx:EntitlementContext,pool:PoolId){return withTenant(ctx,async tx=>ok(new Map((await tx.query<{element_id:ElementId;treatment:Treatment}>(`SELECT t.element_id,t.treatment ${active}`,[pool])).map(row=>[row.element_id,row.treatment]))));}
 forElement(ctx:EntitlementContext,pool:PoolId,element:ElementId){return withTenant(ctx,async tx=>{const [row]=await tx.query<{treatment:Treatment}>(`SELECT t.treatment ${active} AND t.element_id=$2`,[pool,element]);return ok(row?.treatment??null);});}
}
