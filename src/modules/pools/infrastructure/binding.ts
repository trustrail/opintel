import { withTenant } from '../../../platform/db/scope.js';
import { DomainError,err,ok,Timestamp,type PoolId,type SourceId,type ElementId } from '../../../shared/kernel/index.js';
import { Entitlement,type EntitlementState } from '../../entitlements/index.js';
import type { RelationshipOutbox } from '../../tenancy/index.js';
import type { PoolBindingRepository } from '../application/binding.js';
import type { PoolKeyContext } from '../application/keys.js';
export class PostgresPoolBindings implements PoolBindingRepository {
 constructor(private readonly outbox:RelationshipOutbox){}
 set(ctx:PoolKeyContext,pool:PoolId,source:SourceId,bound:boolean):ReturnType<PoolBindingRepository['set']>{
  return withTenant(ctx,async tx=>{
   // Existing entitlement writers lock source before pool. Preserve that order.
   const sources=await tx.query<{status:string}>('SELECT status FROM data_source WHERE id=$1 FOR UPDATE',[source]);
   const pools=await tx.query('SELECT id FROM pool WHERE id=$1 FOR UPDATE',[pool]);
   if(!sources.length||!pools.length)return err(new DomainError('not_found','The pool and source must belong to this project.'));
   if(bound&&sources[0]!.status==='archived')return err(new DomainError('validation_failed','An archived source cannot be bound.'));
   if(bound)await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3) ON CONFLICT(pool_id,source_id) DO NOTHING',[pool,source,ctx.projectId]);
   else await tx.query('DELETE FROM pool_source_binding WHERE pool_id=$1 AND source_id=$2',[pool,source]);
   return ok(await this.outbox.enqueuePoolBinding(tx,pool,source,bound));
  });
 }
 element(ctx:PoolKeyContext,pool:PoolId,source:SourceId,element:ElementId):ReturnType<PoolBindingRepository['element']>{
  return withTenant(ctx,async tx=>{
   const [row]=await tx.query<{bound:boolean;entitlement:(Omit<EntitlementState,'setAt'>&{setAt:string})|null}>(`SELECT
    EXISTS(SELECT 1 FROM pool_source_binding b WHERE b.pool_id=$1 AND b.source_id=s.id) AS bound,
    CASE WHEN t.element_id IS NULL THEN NULL ELSE jsonb_build_object('poolId',t.pool_id,'elementId',t.element_id,'projectId',t.project_id,
     'treatment',t.treatment,'maskKind',t.mask_kind,'setBy',jsonb_build_object('kind',t.source_kind,'id',t.source_ref),'setAt',t.set_at,'justification',t.justification) END AS entitlement
    FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
    LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=$1
    WHERE e.id=$3 AND s.id=$2 AND e.status='active' AND o.status='active' AND s.status<>'archived' AND e.exposed_type IS NOT NULL`,[pool,source,element]);
   if(!row)return err(new DomainError('not_found','The active element was not found in this source.'));
   if(row.entitlement===null)return ok({bound:row.bound,entitlement:null});
   const decision=Entitlement.decide({...row.entitlement,setAt:Timestamp(new Date(row.entitlement.setAt))});
   return decision.ok?ok({bound:row.bound,entitlement:decision.value.state}):decision;
  });
 }
}
