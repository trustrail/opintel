import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import type {ReleaseProvider,ProviderHealth} from '../application/ports.js';
export type XqConfiguration={apiKey:string;dashboardApiKey:string;senderAlias:string;senderAccessToken:string;accessToken?:string;dashboardAccessToken?:string;dashboardUrl?:string;subscriptionUrl?:string;validationUrl?:string};
/** Disposable SDK workers isolate its browser compatibility globals and caches.
 * Only K1 crosses this adapter. Live XQ remains unverified without credentials. */
export class XqReleaseProvider implements ReleaseProvider {
 readonly id='xq';
 constructor(private readonly configuration:XqConfiguration,readonly tenant:string,readonly redeemAt:string,readonly reportedRegion?:string){}
 private call(operation:'register'|'escrow'|'revoke'|'fetch'|'health'|'dashboard_health',args:Record<string,unknown>,configuration=this.configuration):Promise<unknown>{return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./xq-worker.mjs',import.meta.url),{workerData:{configuration,operation,...args}});
  let complete=false;const stop=setTimeout(()=>{void worker.terminate();if((operation==='health'||operation==='dashboard_health'))resolve({reachable:false,authenticated:false,failure:'deadline_exceeded'});else reject(new Error('Custody provider deadline exceeded.'));},20000);
  worker.once('message',(raw:unknown)=>{complete=true;clearTimeout(stop);const result=z.discriminatedUnion('ok',[z.object({ok:z.literal(true),value:z.unknown()}),z.object({ok:z.literal(false)})]).safeParse(raw);void worker.terminate();if(result.success&&result.data.ok)resolve(result.data.value);else reject(new Error('Custody provider operation refused.'));});
  worker.once('error',()=>{clearTimeout(stop);reject(new Error('Custody provider worker failed.'));});worker.once('exit',()=>{clearTimeout(stop);if(!complete)reject(new Error('Custody provider worker exited without acknowledgement.'));});
 });}
 async health():Promise<ProviderHealth>{
  let api:ProviderHealth={reachable:false,authenticated:false,failure:'credentials_missing'};
  if(this.configuration.apiKey&&this.configuration.senderAlias&&this.configuration.senderAccessToken){try{api=z.strictObject({reachable:z.boolean(),authenticated:z.boolean(),failure:z.enum(['credentials_missing','authentication_refused','provider_refused','unreachable','deadline_exceeded','invalid_response']).nullable()}).parse(await this.call('health',{}));}catch{api={reachable:false,authenticated:false,failure:'unreachable'};}}
  const dashboard=!this.configuration.dashboardApiKey?{status:'not_set' as const,failure:null}:!this.configuration.dashboardAccessToken?{status:'failed' as const,failure:'credentials_missing' as const}:await this.dashboardHealth();return {...api,dashboard};
 }
 private async dashboardHealth(){try{const result=z.strictObject({reachable:z.boolean(),authenticated:z.boolean(),failure:z.enum(['credentials_missing','authentication_refused','provider_refused','unreachable','deadline_exceeded','invalid_response']).nullable()}).parse(await this.call('dashboard_health',{}));return {status:result.authenticated?'authenticated' as const:'failed' as const,failure:result.failure};}catch{return {status:'failed' as const,failure:'unreachable' as const};}}
 async register(alias:string){await this.call('register',{alias});}
 async escrow(key:Uint8Array,alias:string,ttlSeconds:number,singleUse:true,receipt?:string){if(key.length!==32||singleUse!==true||ttlSeconds<=0)throw new Error('Invalid custody escrow.');return z.string().min(1).parse(await this.call('escrow',{share:Buffer.from(key).toString('base64url'),alias,ttlSeconds,receipt}));}
 async revoke(locator:string){await this.call('revoke',{locator});}
 async redemptions(_since:Date){return {status:'unsupported' as const}; /* Event-field mapping awaits verification against a real tenant. */}
 async fetch(locator:string,alias:string,accessToken:string){return Buffer.from(z.string().regex(/^[A-Za-z0-9_-]{43}$/u).parse(await this.call('fetch',{locator,alias},{...this.configuration,accessToken})),'base64url');}
}
