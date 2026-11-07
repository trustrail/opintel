import {custodyProviderFailure,custodyEscrowRequest,custodyXqOperationFailure,custodyXqProgress} from '../../../shared/custody-failure.js';
import {xqNativeCode} from './xq-diagnostics.mjs';
import {randomUUID} from 'node:crypto';
import {decodeXqShare} from '../../../shared/xq-share-codec.mjs';
import {CustodyProviderError} from './provider-failure.js';
import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import type {ReleaseProvider,ProviderHealth,ProviderCorrelation} from '../application/ports.js';
export type XqConfiguration={apiKey:string;dashboardApiKey:string;senderAlias:string;senderAccessToken:string;accessToken?:string;dashboardAccessToken?:string;dashboardUrl?:string;subscriptionUrl?:string;validationUrl?:string};
/** Disposable SDK workers isolate its browser compatibility globals and caches.
 * Only K1 crosses this adapter. Agent certificate exchange stays agent-side. */
export class XqReleaseProvider implements ReleaseProvider {
 readonly id='xq';
 constructor(private readonly configuration:XqConfiguration,readonly tenant:string,readonly redeemAt:string,readonly reportedRegion?:string){}
 private call(operation:'escrow'|'revoke'|'fetch'|'health',args:Record<string,unknown>,configuration=this.configuration):Promise<unknown>{return new Promise((resolve,reject)=>{
  const operationId=randomUUID(),correlation=z.object({enrollmentId:z.uuid(),credentialId:z.uuid()}).safeParse(args.correlation),receipt=z.uuid().safeParse(args.receipt);
  const log=(failure:z.infer<typeof custodyProviderFailure>)=>console.warn(JSON.stringify(custodyXqOperationFailure.parse({event:'custody.xq_operation_failed',timestamp:new Date().toISOString(),operation,operationId,enrollmentId:correlation.success?correlation.data.enrollmentId:null,credentialId:correlation.success?correlation.data.credentialId:null,evidenceId:receipt.success?receipt.data:null,kind:failure.kind,nativeErrorCode:xqNativeCode(failure.nativeErrorCode),phase:failure.phase??lastProgress?.phase??null,subcall:failure.subcall??lastProgress?.subcall??null,attempt:failure.attempt??lastProgress?.attempt??null,status:'status' in failure?failure.status:null,written:failure.written??lastProgress?.written??null})));
  const worker=new Worker(new URL('./xq-worker.mjs',import.meta.url),{workerData:{configuration,operation,...args}});
  let complete=false,lastProgress:z.infer<typeof custodyXqProgress>|undefined;
  const fail=(failure:z.infer<typeof custodyProviderFailure>)=>{if(complete)return;complete=true;clearTimeout(stop);log(failure);reject(new CustodyProviderError(failure));};
  const stop=setTimeout(()=>{if(complete)return;void worker.terminate();if(operation==='health'){complete=true;log({kind:'worker_deadline_exceeded'});resolve({reachable:false,authenticated:false,failure:'deadline_exceeded'});}else fail({kind:'worker_deadline_exceeded'});},20000);
  worker.on('message',(raw:unknown)=>{
   if(complete)return;const progress=custodyXqProgress.safeParse(raw);if(progress.success){lastProgress=progress.data;return;}const diagnostic=custodyEscrowRequest.safeParse(raw);if(diagnostic.success){if(operation==='escrow')console.info(JSON.stringify({event:'custody.xq_escrow_request',...diagnostic.data}));return;}
   const result=z.discriminatedUnion('ok',[z.object({ok:z.literal(true),value:z.unknown(),diagnostic:custodyProviderFailure.optional()}),z.object({ok:z.literal(false),failure:custodyProviderFailure.optional()})]).safeParse(raw);
   void worker.terminate();
   if(result.success&&result.data.ok){complete=true;clearTimeout(stop);if(result.data.diagnostic)log(result.data.diagnostic);resolve(result.data.value);}
   else fail(result.success&&!result.data.ok?result.data.failure??{kind:'operation_refused'}:{kind:'invalid_response'});
  });
  worker.once('error',()=>fail({kind:'worker_failed'}));worker.once('exit',()=>{if(!complete)fail({kind:'worker_exited'});});
 });}
 async health():Promise<ProviderHealth>{
  let api:ProviderHealth={reachable:false,authenticated:false,failure:'credentials_missing'};
  if(this.configuration.apiKey&&this.configuration.senderAlias&&this.configuration.senderAccessToken){try{api=z.strictObject({reachable:z.boolean(),authenticated:z.boolean(),failure:z.enum(['credentials_missing','authentication_refused','provider_refused','unreachable','deadline_exceeded','invalid_response']).nullable()}).parse(await this.call('health',{}));}catch{api={reachable:false,authenticated:false,failure:'unreachable'};}}
  return api;
 }
 async escrow(key:Uint8Array,recipientIdentifier:string,ttlSeconds:number,singleUse:true,receipt?:string,correlation?:ProviderCorrelation){if(key.length!==32||singleUse!==true||ttlSeconds<=0)throw new Error('Invalid custody escrow.');return z.string().min(1).parse(await this.call('escrow',{share:Buffer.from(key).toString('base64url'),recipientIdentifier,ttlSeconds,receipt,correlation}));}
 async revoke(locator:string){await this.call('revoke',{locator});}
 async redemptions(_since:Date){return {status:'unsupported' as const}; /* Event-field mapping awaits verification against a real tenant. */}
 async fetch(locator:string,alias:string,accessToken:string){return decodeXqShare(await this.call('fetch',{locator,alias},{...this.configuration,accessToken}));}
}
