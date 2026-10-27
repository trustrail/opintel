import {custodyFailure,custodyFailureCode} from '../../../shared/custody-failure.js';
import {CustodyProviderError} from './provider-failure.js';
import {randomUUID} from 'node:crypto';
import {releaseClaims} from '../../../shared/release-contract.js';
import {withPlatform} from '../../../platform/db/scope.js';
import {readSetting,projectSettingSchema} from '../../../shared/project-settings.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {ReleaseContext,ReleaseProvider} from '../application/ports.js';
import {requireEngineShares,type QueryReleasePort} from '../application/query-release.js';
import type {ReleaseService} from '../application/service.js';
import {custodyExecutionAvailable} from './availability.js';
import {credentialCustodyRecipient} from '../../pools/index.js';
export class QueryRelease implements QueryReleasePort {
 constructor(private readonly provider:ReleaseProvider,private readonly service:ReleaseService,private readonly redeemAt:string){}
 available(ctx:ReleaseContext){return custodyExecutionAvailable(ctx.projectId);}
 async discard(ctx:ReleaseContext,grants:readonly {grant:string}[]){for(const {grant} of grants){const claims=releaseClaims.parse(JSON.parse(Buffer.from(grant.split('.')[1]??'','base64url').toString('utf8')) as unknown);await this.service.revoke(ctx,claims.jti,'system:delivery_failed');}}
 async seal(ctx:ReleaseContext,alias:string,receipt:string,columns:string[],rows:unknown[][],indices:number[],shares?:{first:string;second:string}){
  const valid=requireEngineShares(shares);if(!valid.ok)return valid;
  const [project]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));
  const parsed=projectSettingSchema('custody.grant_ttl').safeParse(readSetting(project?.settings,'custody.grant_ttl'));if(!parsed.success)return err(new DomainError('validation_failed','Configure a valid custody grant lifetime before releasing custody values.',{cause:'invalid_settings'}));
  const ttl=Number(parsed.data),iat=Math.floor(Date.now()/1000),exp=iat+ttl,id=randomUUID();
  const sealed={rows,first:Buffer.from(shares!.first,'base64url'),second:Buffer.from(shares!.second,'base64url')};let locator:string|undefined;let phase:'credential_association'|'escrow'|'grant_issue'='credential_association';
  shares!.first='';shares!.second='';
  if(sealed.first.length!==32||sealed.second.length!==32){sealed.first.fill(0);sealed.second.fill(0);return err(new DomainError('dependency_unavailable','Invalid Engine custody shares. No result was released.'));}
  try{
   // Grant subjects remain immutable internal identities. Only XQ addressing
   // uses the separately registered public identity; no certificate keys enter here.
   const recipient=this.provider.id==='xq'?await credentialCustodyRecipient(ctx,alias):alias;
   if(!recipient)return err(new DomainError('dependency_unavailable','This credential has no active XQ certificate association. No result was released.',{cause:'release_prepare_failed',reason:'certificate_association_missing'}));
   phase='escrow';locator=await this.provider.escrow(sealed.first,recipient,ttl,true,receipt);sealed.first.fill(0);
   const names=indices.map(i=>columns[i]!);
   phase='grant_issue';const issued=await this.service.issue(ctx,{iss:ctx.projectId,sub:alias,aud:this.provider.id,jti:id,iat,exp,rcpt:receipt,cols:names,custody:{provider:this.provider.id,tenant:this.provider.tenant,provider_redeem_at:this.provider.redeemAt,locator,opintel_redeem_at:this.redeemAt}},sealed.second);
   if(!issued.ok){
    // The revoked-credential path persisted a cleanup record. Let the sweeper
    // acknowledge it atomically instead of revoking here without recording ack.
    if(issued.error.details?.cause!=='credential_revoked_after_escrow')await this.provider.revoke(locator).catch(()=>{});
    return issued;
   }
   return ok({rows:sealed.rows,custody:[{columns:names,grant:issued.value}]});
  }catch(error){
   let code:null|ReturnType<typeof custodyFailureCode.parse>=null;
   try{if(error instanceof Error&&'code' in error){const parsed=custodyFailureCode.safeParse(error.code);if(parsed.success)code=parsed.data;}}catch{/* Untrusted diagnostic accessors cannot change the refusal. */}
   const failure=custodyFailure.parse({phase,provider:['local','xq'].includes(this.provider.id)?this.provider.id:'other',exception:{type:exceptionType(error),code},providerFailure:error instanceof CustodyProviderError?error.failure:null});
   console.info({event:'custody.release_refused',timestamp:new Date().toISOString(),evidenceId:receipt,releaseFailure:failure});
   if(locator)await this.provider.revoke(locator).catch(()=>{});
   return err(new DomainError('dependency_unavailable','Custody release could not be prepared. No result was released.',{cause:'release_prepare_failed',releaseFailure:failure}));
  }
  finally{sealed.first.fill(0);sealed.second.fill(0);}
 }
}
/** Classify by built-in identity, never by native name, message or stack text. */
function exceptionType(error:unknown):ReturnType<typeof custodyFailure.parse>['exception']['type']{
 try{
  if(!(error instanceof Error))return null;
  const prototype:unknown=Object.getPrototypeOf(error);
  if(prototype===CustodyProviderError.prototype)return 'CustodyProviderError';
  if(prototype===TypeError.prototype)return 'TypeError';
  if(prototype===RangeError.prototype)return 'RangeError';
  if(prototype===SyntaxError.prototype)return 'SyntaxError';
  if(prototype===ReferenceError.prototype)return 'ReferenceError';
  if(prototype===URIError.prototype)return 'URIError';
  if(prototype===EvalError.prototype)return 'EvalError';
  if(prototype===Error.prototype)return 'Error';
 }catch{/* Untrusted prototypes cannot prevent the fail-closed refusal. */}
 return null;
}
