import {randomUUID} from 'node:crypto';
import {releaseClaims} from '../../../shared/release-contract.js';
import {withPlatform} from '../../../platform/db/scope.js';
import {readSetting,projectSettingSchema} from '../../../shared/project-settings.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {ReleaseContext,ReleaseProvider} from '../application/ports.js';
import type {QueryReleasePort} from '../application/query-release.js';
import type {ReleaseService} from '../application/service.js';
import {sealResult} from './crypto.js';
import {custodyExecutionAvailable} from './availability.js';
export class QueryRelease implements QueryReleasePort {
 constructor(private readonly provider:ReleaseProvider,private readonly service:ReleaseService,private readonly redeemAt:string,private readonly sealer:typeof sealResult=sealResult){}
 available(ctx:ReleaseContext){return custodyExecutionAvailable(ctx.projectId);}
 async discard(ctx:ReleaseContext,grants:readonly {grant:string}[]){for(const {grant} of grants){const claims=releaseClaims.parse(JSON.parse(Buffer.from(grant.split('.')[1]??'','base64url').toString('utf8')) as unknown);await this.service.revoke(ctx,claims.jti,'system:delivery_failed');}}
 async seal(ctx:ReleaseContext,alias:string,receipt:string,columns:string[],rows:unknown[][],indices:number[]){
  const [project]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));
  const parsed=projectSettingSchema('custody.grant_ttl').safeParse(readSetting(project?.settings,'custody.grant_ttl'));if(!parsed.success)return err(new DomainError('validation_failed','Configure a valid custody grant lifetime before releasing custody values.',{cause:'invalid_settings'}));
  const ttl=Number(parsed.data),iat=Math.floor(Date.now()/1000),exp=iat+ttl,id=randomUUID();
  const sealed=this.sealer(rows,columns,indices,receipt);let locator:string|undefined;
  try{
   locator=await this.provider.escrow(sealed.first,alias,ttl,true);sealed.first.fill(0);
   const names=indices.map(i=>columns[i]!);
   const issued=await this.service.issue(ctx,{iss:ctx.projectId,sub:alias,aud:this.provider.id,jti:id,iat,exp,rcpt:receipt,cols:names,custody:{provider:this.provider.id,tenant:this.provider.tenant,provider_redeem_at:this.provider.redeemAt,locator,opintel_redeem_at:this.redeemAt}},sealed.second);
   if(!issued.ok){await this.provider.revoke(locator).catch(()=>{});return issued;}
   return ok({rows:sealed.rows,custody:[{columns:names,grant:issued.value}]});
  }catch{if(locator)await this.provider.revoke(locator).catch(()=>{});return err(new DomainError('dependency_unavailable','Custody release could not be prepared. No result was released.',{cause:'release_prepare_failed'}));}
  finally{sealed.first.fill(0);sealed.second.fill(0);}
 }
}
