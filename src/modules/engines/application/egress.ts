import type {EgressHeartbeat,EgressPolicy} from '../../../shared/engine-egress-contract.js';
import type {ProjectId,Result} from '../../../shared/kernel/index.js';
export interface EngineEgressRepository {
 heartbeat(pin:string,input:EgressHeartbeat):Promise<Result<{policy:EgressPolicy;released:boolean}>>;
}
export class EngineEgress {
 constructor(private readonly repository:EngineEgressRepository,private readonly resume:(project:ProjectId)=>Promise<void>){}
 async heartbeat(pin:string,input:EgressHeartbeat):Promise<Result<EgressPolicy>>{
  const result=await this.repository.heartbeat(pin,input);
  if(!result.ok)return result;
  // Resume also on subsequent acknowledgments: a gateway restart between the
  // durable release and dispatch must not strand queued connection tests.
  if(input.appliedVersion===result.value.policy.version)await this.resume(input.projectId);
  return {ok:true,value:result.value.policy};
 }
}
