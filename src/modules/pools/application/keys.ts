import type { Tx } from '../../../platform/db/scope.js';
import { DomainError, err, type PoolId, type ProjectId, type UserId, type Timestamp, type Result } from '../../../shared/kernel/index.js';
import { CreatePoolBody, PoolKeyIdempotency, type PoolKeyCreationResponse, type PoolKeyStored, type PoolKeyMetadata } from '../../../shared/api/pool-keys.js';
import type { PoolKeyId } from '../domain/pool.js';
export type PoolKeyContext = {projectId:ProjectId;userId:UserId};
export type AffectedAgents={affectedAgentCount:number;affectedAgents:string[];previouslySeenAgents:string[]};
export interface AgentPresenceQuery {
 /** Reuses a caller-owned tenant scope while revocation holds its pool lock. */
 affectedInScope?(tx:Tx,poolId:PoolId,keyVersion:PoolKeyId,settings:unknown,at:Timestamp):Promise<Result<AffectedAgents>>;
 affected(ctx:PoolKeyContext,poolId:PoolId,keyVersion:PoolKeyId):Promise<Result<AffectedAgents>>;
}
export type KeyCommand = {kind:'create';name:string} | {kind:'rotate';poolId:PoolId} | {kind:'revoke';poolId:PoolId;keyVersion:PoolKeyId;confirmation:string};
export interface PoolKeyRepository {
 execute(ctx:PoolKeyContext,command:KeyCommand,idempotencyKey:string,presence:AgentPresenceQuery):Promise<Result<PoolKeyCreationResponse|PoolKeyStored>>;
 inspect(ctx:PoolKeyContext,poolId:PoolId,keyVersion:PoolKeyId):Promise<Result<PoolKeyMetadata>>;
}
export class PoolKeyService {
 constructor(private readonly repository:PoolKeyRepository,private readonly presence:AgentPresenceQuery) {}
 execute(ctx:PoolKeyContext,command:KeyCommand,idempotency:unknown) {
  const key=PoolKeyIdempotency.safeParse(idempotency);
  if(!key.success)return Promise.resolve(err(new DomainError('validation_failed','Idempotency-Key is required.')));
  if(command.kind==='create'){
   const body=CreatePoolBody.safeParse({name:command.name});
   if(!body.success)return Promise.resolve(err(new DomainError('validation_failed','A pool name must contain 1 to 80 characters.')));
   return this.repository.execute(ctx,{kind:'create',name:body.data.name},key.data,this.presence);
  }
  return this.repository.execute(ctx,command,key.data,this.presence);
 }
 async affected(ctx:PoolKeyContext,poolId:PoolId,keyVersion:PoolKeyId) {
  const key=await this.repository.inspect(ctx,poolId,keyVersion);if(!key.ok)return key;
  const agents=await this.presence.affected(ctx,poolId,keyVersion);if(!agents.ok)return agents;
  return {ok:true as const,value:{...key.value,...agents.value}};
 }
}
export type KeyVerdict = {ok:true;pool:{id:PoolId;projectId:ProjectId;name:string;modes:{query:boolean;prompt:boolean};clarificationPolicy:'pause'|'refuse'};keyPrefix:string;keyState:'current'|'retiring';keyVersion:PoolKeyId;scopeUserId:UserId} | {ok:false;reason:'unknown'|'revoked'|'expired'|'malformed'};
export interface KeyVerifier { verify(presented:string):Promise<KeyVerdict>; }
