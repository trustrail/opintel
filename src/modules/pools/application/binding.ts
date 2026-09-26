import { DomainError,err,ok,type ElementId,type PoolId,type SourceId,type Result } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { RelationshipOutbox } from '../../tenancy/index.js';
import type { EntitlementState,Treatment } from '../../entitlements/index.js';
import type { KeyVerifier,PoolKeyContext } from './keys.js';
export interface PoolBindingRepository {
 set(ctx:PoolKeyContext,pool:PoolId,source:SourceId,bound:boolean):Promise<Result<readonly bigint[]>>;
 element(ctx:PoolKeyContext,pool:PoolId,source:SourceId,element:ElementId):Promise<Result<{bound:boolean;entitlement:EntitlementState|null}>>;
}
export interface PoolAccessRefusals {
 record(input:{poolId?:PoolId;sourceId:SourceId;elementId:ElementId;reason:string}):Promise<void>;
}
export class PoolBindingService {
 constructor(private readonly repository:PoolBindingRepository,private readonly outbox:RelationshipOutbox,private readonly authorization:AuthorizationPort){}
 async set(ctx:PoolKeyContext,pool:PoolId,source:SourceId,bound:boolean):Promise<Result<void>>{
  const [permission]=await this.authorization.checkMany([{resource:{type:'project',id:ctx.projectId},permission:'bind_source',subject:{type:'user',id:ctx.userId}}]);
  if(!permission?.allowed)return err(new DomainError('forbidden','You cannot change source bindings in this project.'));
  const saved=await this.repository.set(ctx,pool,source,bound);if(!saved.ok)return saved;
  let written=true;
  for(const id of saved.value){try{if(await this.outbox.dispatchOne(this.authorization,id)===null)written=false;}catch{written=false;}}
  return written?ok(undefined):err(new DomainError('dependency_unavailable','The binding decision was saved, but its authorization relationships are still pending.',{poolId:pool,sourceId:source},true));
 }
}
/** Returns the exact permitted treatment, never an unrestricted read grant.
 * SQL operation restrictions and execution-time binding remain S2. */
export class PoolElementResolver {
 constructor(private readonly keys:KeyVerifier,private readonly bindings:PoolBindingRepository,private readonly authorization:AuthorizationPort,private readonly refusals:PoolAccessRefusals){}
 async resolve(ctx:PoolKeyContext,bearer:string,source:SourceId,element:ElementId,requestedTreatment:Treatment):Promise<Result<EntitlementState>>{
  const key=await this.keys.verify(bearer);
  const refuse=async(error:DomainError,poolId?:PoolId,reason:string=error.code):Promise<Result<never>>=>{
   await this.refusals.record({...(poolId===undefined?{}:{poolId}),sourceId:source,elementId:element,reason});return err(error);
  };
  // Never reveal a pool or distinguish malformed/unknown/revoked/expired keys.
  if(!key.ok||key.pool.projectId!==ctx.projectId)return refuse(new DomainError('unauthenticated','The pool key is not valid.'),undefined,key.ok?'key_project_mismatch':`key_${key.reason}`);
  const pool=key.pool.id;
  // checkMany is fully consistent and has no stale-snapshot fallback. Both
  // checks run anew for every resolution; an entitlement cannot grant binding.
  const [checks,state]=await Promise.all([
   this.authorization.checkMany([{resource:{type:'datasource',id:source},permission:'reachable',subject:{type:'pool',id:pool}}]),
   this.bindings.element(ctx,pool,source,element),
  ]);
  if(!state.ok)return refuse(state.error,pool);
  if(!checks[0]?.allowed||!state.value.bound)return refuse(new DomainError('forbidden','This pool cannot reach the source.'),pool);
  const entitlement=state.value.entitlement;
  if(entitlement===null)return refuse(new DomainError('entitlement_missing','This element has no entitlement for the pool.'),pool);
  if(entitlement.treatment==='withheld')return refuse(new DomainError('element_withheld','This element is withheld from the pool.'),pool);
  if(entitlement.treatment!==requestedTreatment)return refuse(new DomainError('forbidden','The requested treatment does not match this element’s entitlement.'),pool);
  return ok(entitlement);
 }
}
