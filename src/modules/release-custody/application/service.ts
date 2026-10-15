import {DomainError,err,ok,type Result} from '../../../shared/kernel/index.js';
import {releaseNonClaim,releaseClaims,type ReleaseClaims,type ReleaseEvent} from '../../../shared/release-contract.js';
import type {GrantSignatures,ReleaseContext,ReleaseProvider,ReleaseRepository} from './ports.js';
const refused=()=>err(new DomainError('forbidden',"This release grant is expired, revoked, has already released its Opintel share, or belongs to another credential. No release share was returned. "+releaseNonClaim,{cause:'release_refused'}));
export class ReleaseService {
 constructor(private readonly repository:ReleaseRepository,private readonly signatures:GrantSignatures,private readonly provider:ReleaseProvider,private readonly now:()=>Date=()=>new Date()){}
 describe(ctx:ReleaseContext){return this.signatures.describe(ctx);}
 async issue(ctx:ReleaseContext,claims:ReleaseClaims,share:Uint8Array):Promise<Result<string>> {
  const parsed=releaseClaims.safeParse(claims);
  try{
   if(!parsed.success||claims.iss!==ctx.projectId||claims.aud!==this.provider.id||share.length!==32||claims.exp<=Math.floor(this.now().getTime()/1000))return err(new DomainError('validation_failed','The custody grant cannot be issued.'));
   const grant=await this.signatures.sign(ctx,claims);
   return await this.repository.exclusive(ctx,claims.jti,async s=>{if(await s.get())return err(new DomainError('conflict','This release grant already exists.'));if(!await s.canIssue(claims.sub)){
    // Escrow may have finished after credential revocation. Persist its locator
    // without K2 so a provider outage cannot orphan the cleanup record.
    await s.save({claims,grant,share:null,state:'revoked',escrowRevoked:false});
    await s.event(this.event(claims,'revoked','system:credential_revoked',null));
    return err(new DomainError('forbidden','The credential was revoked before release. No result was released.',{cause:'credential_revoked_after_escrow'}));
   }await s.save({claims,grant,share,state:'granted',escrowRevoked:false});await s.event(this.event(claims,'granted',null,null));return ok(grant);});
  }finally{share.fill(0);}
 }
 async redeem(ctx:ReleaseContext,grant:string,alias:string,origin:string|null):Promise<Result<{share:string;receipt:string;grantId:string}>> {
  const checked=await this.signatures.verify(ctx,grant);if(!checked.ok)return refused();const c=checked.value;
  if(c.iss!==ctx.projectId||c.sub!==alias||c.aud!==this.provider.id)return refused();
  return this.repository.exclusive(ctx,c.jti,async s=>{
   const value=await s.get();if(!value||value.grant!==grant||value.state!=='granted'||!value.share)return refused();
   if(c.exp<=Math.floor(this.now().getTime()/1000)){value.share.fill(0);value.share=null;value.state='expired';await s.save(value);await s.event(this.event(c,'expired',null,null));return refused();}
   // Repository commits the deletion and first-hand event before returning K2.
   const share=Buffer.from(value.share).toString('base64url');value.share.fill(0);value.share=null;value.state='redeemed';await s.save(value);await s.event(this.event(c,'redeemed',alias,origin));
   return ok({share,receipt:c.rcpt,grantId:c.jti});
  });
 }
 async revoke(ctx:ReleaseContext,id:string,actor:string):Promise<Result<void>> {
  return this.repository.exclusive(ctx,id,async s=>{
   const v=await s.get();if(!v)return err(new DomainError('not_found','The release grant was not found in this project.'));
   v.revocationRequested=true;v.share?.fill(0);v.share=null;if(v.state==='granted')v.state='revoked';
   await s.save(v);await s.event(this.event(v.claims,'revoked',actor,null));
   // Commit local refusal even if the provider is unavailable. Pending cleanup
   // remains discoverable until revoke is acknowledged.
   try{await this.provider.revoke(v.claims.custody.locator);v.escrowRevoked=true;await s.save(v);}catch{ /* Retried by sweep; no secret or exception is logged. */ }
   return ok(undefined);
  });
 }
 async sweep():Promise<void>{
  const corroboration=await this.provider.redemptions(new Date(0)).catch(()=>({status:'unsupported' as const}));
  const observed=corroboration.status==='supported'?corroboration.events:[];
  for(const {ctx,grantId} of await this.repository.due())await this.repository.exclusive(ctx,grantId,async s=>{
   const v=await s.get();if(!v)return;const c=v.claims;if(c.custody.provider!==this.provider.id||c.custody.tenant!==this.provider.tenant)return;const expired=c.exp<=Math.floor(this.now().getTime()/1000),event=observed.find(e=>e.locator===c.custody.locator&&e.alias===c.sub);
   if(expired&&v.state==='granted'){v.share?.fill(0);v.share=null;v.state='expired';await s.event(this.event(c,'expired',null,null));await s.save(v);}
   if(event)await s.event({grantId:c.jti,receipt:c.rcpt,kind:'provider_redeemed',at:event.at.toISOString(),alias:event.alias,actor:null,jurObserved:event.origin??this.provider.reportedRegion??null});
   if(!v.escrowRevoked&&(expired||event||v.state==='revoked'||v.revocationRequested)){try{await this.provider.revoke(c.custody.locator);v.escrowRevoked=true;await s.save(v);}catch{ /* Keep cleanup pending; K2 still refuses by exp/state. */ }}
  });
 }
 private event(c:ReleaseClaims,kind:ReleaseEvent['kind'],actor:string|null,origin:string|null):ReleaseEvent{return {grantId:c.jti,receipt:c.rcpt,kind,at:this.now().toISOString(),alias:c.sub,actor,jurObserved:origin};}
}
