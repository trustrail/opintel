import { DomainError,err,type PoolId,type Result } from '../../../shared/kernel/index.js';
import { PresenceSignal } from '../../../shared/api/agent-presence.js';
import type { AgentPresence } from '../domain/presence.js';
import type { PoolKeyId } from '../domain/pool.js';
import type { PoolKeyContext } from './keys.js';
export type AuthenticatedPresence={poolId:PoolId;keyVersion:PoolKeyId};
export interface AgentPresenceRepository {
 observe(ctx:PoolKeyContext,authenticated:AuthenticatedPresence,signal:{agentId:string;client:string|null;kind:'connect'|'request'|'heartbeat'}):Promise<Result<AgentPresence>>;
 list(ctx:PoolKeyContext,pool:PoolId,after:string|null,limit:number):Promise<Result<AgentPresence[]>>;
 sweep(ctx:PoolKeyContext):Promise<void>;
}
/** Caller supplies the pool/key resolved by authentication. The claimed id is
 * observational and is never sent to an authorization port. */
export class AgentPresenceService {
 constructor(private readonly repository:AgentPresenceRepository){}
 async observeAuthenticated(ctx:PoolKeyContext,authenticated:AuthenticatedPresence,input:unknown){
  const signal=PresenceSignal.safeParse(input);
  if(!signal.success){
   console.info({event:'agent.presence_refused',poolId:authenticated.poolId,reason:'invalid_presence_signal'});
   return err(new DomainError('validation_failed','Supply the X-Opintel-Agent-Id header and a valid presence signal.'));
  }
  const result=await this.repository.observe(ctx,authenticated,signal.data);
  if(!result.ok)console.info({event:'agent.presence_refused',poolId:authenticated.poolId,reason:result.error.code});
  return result;
 }
 list(ctx:PoolKeyContext,pool:PoolId,after:string|null,limit:number){return this.repository.list(ctx,pool,after,limit);}
}
