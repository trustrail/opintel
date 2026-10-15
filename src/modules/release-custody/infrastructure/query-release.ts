import {randomUUID} from 'node:crypto';
import {releaseClaims} from '../../../shared/release-contract.js';
import {withPlatform} from '../../../platform/db/scope.js';
import {readSetting,projectSettingSchema} from '../../../shared/project-settings.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {ReleaseContext,ReleaseProvider} from '../application/ports.js';
import {requireEngineShares,type QueryReleasePort} from '../application/query-release.js';
import type {ReleaseService} from '../application/service.js';
import {custodyExecutionAvailable} from './availability.js';
export class QueryRelease implements QueryReleasePort {
 constructor(private readonly provider:ReleaseProvider,private readonly service:ReleaseService,private readonly redeemAt:string){}
 available(ctx:ReleaseContext){return custodyExecutionAvailable(ctx.projectId);}
 async discard(ctx:ReleaseContext,grants:readonly {grant:string}[]){for(const {grant} of grants){const claims=releaseClaims.parse(JSON.parse(Buffer.from(grant.split('.')[1]??'','base64url').toString('utf8')) as unknown);await this.service.revoke(ctx,claims.jti,'system:delivery_failed');}}
 async seal(ctx:ReleaseContext,alias:string,receipt:string,columns:string[],rows:unknown[][],indices:number[],shares?:{first:string;second:string}){
  const valid=requireEngineShares(shares);if(!valid.ok)return valid;
  const [project]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));
  const parsed=projectSettingSchema('custody.grant_ttl').safeParse(readSetting(project?.settings,'custody.grant_ttl'));if(!parsed.success)return err(new DomainError('validation_failed','Configure a valid custody grant lifetime before releasing custody values.',{cause:'invalid_settings'}));
  const ttl=Number(parsed.data),iat=Math.floor(Date.now()/1000),exp=iat+ttl,id=randomUUID();
  const sealed={rows,first:Buffer.from(shares!.first,'base64url'),second:Buffer.from(shares!.second,'base64url')};let locator:string|undefined;
  shares!.first='';shares!.second='';
  if(sealed.first.length!==32||sealed.second.length!==32){sealed.first.fill(0);sealed.second.fill(0);return err(new DomainError('dependency_unavailable','Invalid Engine custody shares. No result was released.'));}
  try{
   locator=await this.provider.escrow(sealed.first,alias,ttl,true,receipt);sealed.first.fill(0);
   const names=indices.map(i=>columns[i]!);
   const issued=await this.service.issue(ctx,{iss:ctx.projectId,sub:alias,aud:this.provider.id,jti:id,iat,exp,rcpt:receipt,cols:names,custody:{provider:this.provider.id,tenant:this.provider.tenant,provider_redeem_at:this.provider.redeemAt,locator,opintel_redeem_at:this.redeemAt}},sealed.second);
   if(!issued.ok){
    // The revoked-credential path persisted a cleanup record. Let the sweeper
    // acknowledge it atomically instead of revoking here without recording ack.
    if(issued.error.details?.cause!=='credential_revoked_after_escrow')await this.provider.revoke(locator).catch(()=>{});
    return issued;
   }
   return ok({rows:sealed.rows,custody:[{columns:names,grant:issued.value}]});
  }catch{if(locator)await this.provider.revoke(locator).catch(()=>{});return err(new DomainError('dependency_unavailable','Custody release could not be prepared. No result was released.',{cause:'release_prepare_failed'}));}
  finally{sealed.first.fill(0);sealed.second.fill(0);}
 }
}
