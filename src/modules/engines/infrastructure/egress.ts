import {createHash} from 'node:crypto';
import {withTenant} from '../../../platform/db/scope.js';
import {DomainError,err,ok,UserId} from '../../../shared/kernel/index.js';
import {egressPolicy,type EgressHeartbeat} from '../../../shared/engine-egress-contract.js';
import type {EngineEgressRepository} from '../application/egress.js';
export class PostgresEngineEgress implements EngineEgressRepository {
 heartbeat(pin:string,input:EgressHeartbeat){return withTenant({projectId:input.projectId,userId:UserId('00000000-0000-4000-8000-000000000001')},async tx=>{
  const engine=await tx.query('SELECT id FROM engine WHERE id=$1 AND certificate_pin=$2 AND verified_at IS NOT NULL AND contract_version=3 FOR UPDATE',[input.engineId,pin.replaceAll(':','').toUpperCase()]);
  if(engine.length!==1)return err(new DomainError('forbidden','This engine is not verified in this project.'));
  const assignments=await tx.query<{sourceId:string;credentialRef:string}>(`SELECT id AS "sourceId",credential_ref AS "credentialRef" FROM data_source WHERE engine_id=$1 AND status<>'archived' ORDER BY id FOR UPDATE`,[input.engineId]);
  const version=createHash('sha256').update(JSON.stringify({projectId:input.projectId,engineId:input.engineId,assignments})).digest('hex');
  const policy=egressPolicy.parse({version,assignments});
  const released=input.appliedVersion===version;
  const failed=input.unreachableSourceIds??[];
  if(failed.some(id=>!assignments.some(row=>row.sourceId===id)))return err(new DomainError('validation_failed','A failed destination is not assigned to this engine.'));
  await tx.query('UPDATE engine SET egress_applied_version=$2,egress_heartbeat_at=now() WHERE id=$1',[input.engineId,input.appliedVersion]);
  if(released){
   await tx.query("UPDATE data_source SET egress_pending=true,status='unreachable' WHERE engine_id=$1 AND id=ANY($2::uuid[]) AND status<>'archived'",[input.engineId,failed]);
   await tx.query("UPDATE data_source SET egress_pending=false,status=CASE WHEN status IN ('pending_egress','unreachable') THEN 'pending' ELSE status END WHERE engine_id=$1 AND egress_pending AND NOT(id=ANY($2::uuid[])) AND status<>'archived'",[input.engineId,failed]);
  }
  return ok({policy,released});
 });}
}
