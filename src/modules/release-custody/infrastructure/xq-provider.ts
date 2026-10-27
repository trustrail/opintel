import {custodyProviderFailure,custodyEscrowRequest} from '../../../shared/custody-failure.js';
import {CustodyProviderError} from './provider-failure.js';
import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import type {ReleaseProvider,ProviderHealth} from '../application/ports.js';
export type XqConfiguration={apiKey:string;dashboardApiKey:string;senderAlias:string;senderAccessToken:string;accessToken?:string;dashboardAccessToken?:string;dashboardUrl?:string;subscriptionUrl?:string;validationUrl?:string};
/** Disposable SDK workers isolate its browser compatibility globals and caches.
 * Only K1 crosses this adapter. Agent certificate exchange stays agent-side. */
export class XqReleaseProvider implements ReleaseProvider {
 readonly id='xq';
 constructor(private readonly configuration:XqConfiguration,readonly tenant:string,readonly redeemAt:string,readonly reportedRegion?:string){}
 private call(operation:'escrow'|'revoke'|'fetch'|'health',args:Record<string,unknown>,configuration=this.configuration):Promise<unknown>{return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./xq-worker.mjs',import.meta.url),{workerData:{configuration,operation,...args}});
  let complete=false;const stop=setTimeout(()=>{void worker.terminate();if(operation==='health')resolve({reachable:false,authenticated:false,failure:'deadline_exceeded'});else reject(new CustodyProviderError({kind:'worker_deadline_exceeded'}));},20000);
  worker.on('message',(raw:unknown)=>{if(complete)return;const diagnostic=custodyEscrowRequest.safeParse(raw);if(diagnostic.success){if(operation==='escrow'){console.info({event:'custody.xq_escrow_request',...diagnostic.data});}return;}complete=true;clearTimeout(stop);const result=z.discriminatedUnion('ok',[z.object({ok:z.literal(true),value:z.unknown()}),z.object({ok:z.literal(false),failure:custodyProviderFailure.optional()})]).safeParse(raw);void worker.terminate();if(result.success&&result.data.ok)resolve(result.data.value);else reject(new CustodyProviderError(result.success&&!result.data.ok?result.data.failure??{kind:'operation_refused'}:{kind:'invalid_response'}));});
  worker.once('error',()=>{clearTimeout(stop);reject(new CustodyProviderError({kind:'worker_failed'}));});worker.once('exit',()=>{clearTimeout(stop);if(!complete)reject(new CustodyProviderError({kind:'worker_exited'}));});
 });}
 async health():Promise<ProviderHealth>{
  let api:ProviderHealth={reachable:false,authenticated:false,failure:'credentials_missing'};
  if(this.configuration.apiKey&&this.configuration.senderAlias&&this.configuration.senderAccessToken){try{api=z.strictObject({reachable:z.boolean(),authenticated:z.boolean(),failure:z.enum(['credentials_missing','authentication_refused','provider_refused','unreachable','deadline_exceeded','invalid_response']).nullable()}).parse(await this.call('health',{}));}catch{api={reachable:false,authenticated:false,failure:'unreachable'};}}
  return api;
 }
 async escrow(key:Uint8Array,recipientIdentifier:string,ttlSeconds:number,singleUse:true,receipt?:string){if(key.length!==32||singleUse!==true||ttlSeconds<=0)throw new Error('Invalid custody escrow.');return z.string().min(1).parse(await this.call('escrow',{share:Buffer.from(key).toString('base64url'),recipientIdentifier,ttlSeconds,receipt}));}
 async revoke(locator:string){await this.call('revoke',{locator});}
 async redemptions(_since:Date){return {status:'unsupported' as const}; /* Event-field mapping awaits verification against a real tenant. */}
 async fetch(locator:string,alias:string,accessToken:string){return Buffer.from(z.string().regex(/^[A-Za-z0-9_-]{43}$/u).parse(await this.call('fetch',{locator,alias},{...this.configuration,accessToken})),'base64url');}
}
