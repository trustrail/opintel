import {randomUUID} from 'node:crypto';
import type {ReleaseProvider} from '../application/ports.js';
import type {ReleaseClaims} from '../../../shared/release-contract.js';
/** Test/harness provider. Credential authentication and signature verification are
 * injected; an alias supplied by the caller is never proof of identity. */
export class LocalReleaseProvider implements ReleaseProvider {
 readonly id='local';readonly tenant='local';readonly redeemAt='https://local.invalid/redeem';
 private readonly aliases=new Set<string>();
 private readonly keys=new Map<string,{share:Buffer;alias:string;expires:number}>();
 private readonly events:{locator:string;alias:string;at:Date;origin:string|null}[]=[];
 constructor(private readonly authenticate:(credential:string)=>Promise<string|null>,private readonly verify:(grant:string)=>Promise<ReleaseClaims|null>,private readonly now:()=>Date=()=>new Date()){}
 async register(alias:string){this.aliases.add(alias);}
 async health(){return {reachable:true,authenticated:true,failure:null} as const;}
 async escrow(key:Uint8Array,alias:string,ttlSeconds:number,singleUse:true){if(key.length!==32||!this.aliases.has(alias)||!Number.isFinite(ttlSeconds)||ttlSeconds<=0||singleUse!==true)throw new Error('Invalid local custody escrow.');const locator=randomUUID();this.keys.set(locator,{share:Buffer.from(key),alias,expires:this.now().getTime()+ttlSeconds*1000});return locator;}
 async revoke(locator:string){this.keys.get(locator)?.share.fill(0);this.keys.delete(locator);}
 async redemptions(since:Date){return {status:'supported' as const,events:this.events.filter(e=>e.at>=since).map(e=>({...e}))};}
 async redeem(grant:string,credential:string):Promise<Buffer>{
  const claims=await this.verify(grant),alias=await this.authenticate(credential);
  if(!claims||!alias||claims.sub!==alias||claims.aud!==this.id||claims.exp<=Math.floor(this.now().getTime()/1000))throw new Error('Local custody redemption refused.');
  const key=this.keys.get(claims.custody.locator);if(!key||key.alias!==alias||key.expires<=this.now().getTime())throw new Error('Local custody redemption refused.');
  const share=Buffer.from(key.share);await this.revoke(claims.custody.locator);this.events.push({locator:claims.custody.locator,alias,at:this.now(),origin:'local'});return share;
 }
 close(){for(const key of this.keys.values())key.share.fill(0);this.keys.clear();}
 async sweep(){for(const [locator,key] of this.keys)if(key.expires<=this.now().getTime())await this.revoke(locator);}
}
