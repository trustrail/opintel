import {egressControlAddress} from './control-address.js';
import {createServer} from 'node:http';
import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {X509Certificate} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {firewall} from './firewall.js';
import {z} from 'zod';
import {egressBinding,egressRegistration,egressPolicy,type EgressPolicy} from '../../../src/shared/engine-egress-contract.js';
import {EnvironmentSecretStore} from '../../../src/platform/secrets/environment-secret-store.js';
import type {SourceId} from '../../../src/shared/kernel/index.js';
import {SecretRef} from '../../../src/platform/secrets/types.js';
const endpoint=z.strictObject({address:z.string().refine(value=>isIP(value)!==0),port:z.number().int().min(1).max(65535),host:z.string().optional()});
type Endpoint=z.infer<typeof endpoint>;
const stored=z.strictObject({binding:egressBinding,policy:egressPolicy.nullable()});
type Stored=z.infer<typeof stored>;
const receiptUrl=z.url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash;});
const configSchema=z.object({receiptUrl:receiptUrl.optional(),postgresReadinessSource:z.string().startsWith('secret://'),tls:z.strictObject({caFile:z.string(),certFile:z.string(),keyFile:z.string(),clientPinFile:z.string()})});
async function resolveEndpoint(uri:URL):Promise<Endpoint[]>{
 const host=uri.hostname.replace(/^\[|\]$/gu,'');
 const port=Number(uri.port||(uri.protocol==='https:'?443:5432));
 const values=isIP(host)?[{address:host}]:await Promise.race([lookup(host,{all:true}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Resolution deadline')),3000);timer.unref();})]);
 return [...new Set(values.map(value=>value.address))].map(address=>endpoint.parse({address,port,...(isIP(host)?{}:{host})}));
}
async function source(ref:string){
 const uri=new URL(await new EnvironmentSecretStore().resolve(SecretRef(ref)));
 if(!['postgres:','postgresql:'].includes(uri.protocol))throw new Error('Unsupported source protocol');
 for(const key of ['host','hostaddr','port','service','connectionString'])if(uri.searchParams.has(key))throw new Error('Routing overrides are unsupported');
 return resolveEndpoint(uri);
}
export type ControllerPhase='configuration'|'tls'|'stored_state'|'bootstrap_policy'|'bootstrap_firewall'|'readiness_resolution'|'receipt_resolution'|'assigned_destination_resolution'|'hosts_update'|'firewall_apply'|'state_persist'|'control_listener'|'readiness_marker';
export async function startController(file:string,phase:(value:ControllerPhase)=>void=()=>{}){
 phase('configuration');
 const config=configSchema.parse(JSON.parse(await readFile(file,'utf8')));
 phase('tls');
 const read=(name:keyof typeof config.tls)=>readFile(resolve(dirname(file),config.tls[name]),'utf8');
 const [ca,cert,key,peer]=await Promise.all([read('caFile'),read('certFile'),read('keyFile'),read('clientPinFile')]);
 const pin=new X509Certificate(peer).fingerprint256;
 phase('stored_state');
 let state:Stored[]=[];
 try{state=z.array(stored).max(32).parse(JSON.parse(await readFile('/egress/state.json','utf8')));}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}
 phase('bootstrap_policy');
 const bootstrap=z.object({sources:z.array(endpoint)}).parse(JSON.parse(await readFile('/policy/egress.json','utf8')));
 // Install readiness before granting the controller-only resolver access.
 phase('bootstrap_firewall');
 firewall(bootstrap.sources);
 let applied=new Map<string,string>();
 let failures=new Map<string,SourceId[]>();
 const persist=async()=>{phase('state_persist');await writeFile('/egress/state.next',JSON.stringify(state),{mode:0o600});await rename('/egress/state.next','/egress/state.json');};
 async function install(){
  applied.clear();
  phase('readiness_resolution');
  const endpoints=[...await source(config.postgresReadinessSource)];
  if(config.receiptUrl){phase('receipt_resolution');try{endpoints.push(...await resolveEndpoint(new URL(config.receiptUrl)));}catch{console.warn({event:'engine.egress_receipt_resolution_failed'});}}
  phase('assigned_destination_resolution');
  const denied=new Map<string,SourceId[]>();
  for(const entry of state){
   try{endpoints.push(...await resolveEndpoint(new URL(entry.binding.gatewayUrl)));}catch{console.warn({event:'engine.egress_gateway_resolution_failed'});}
   const failed:SourceId[]=[];
   for(const item of entry.policy?.assignments??[]){try{const resolved=await source(item.credentialRef);if(!resolved.length)throw new Error('No source addresses');endpoints.push(...resolved);}catch{failed.push(item.sourceId);}}
   denied.set(entry.binding.projectId,failed);
  }
  // The engine's read-only hosts mount preserves original PostgreSQL hostnames
  // and TLS verification without granting the query UID general DNS access.
  phase('hosts_update');
  await writeFile('/egress/hosts','127.0.0.1 localhost\n::1 localhost\n'+[...new Set(endpoints.filter(value=>value.host).map(value=>`${value.address} ${value.host}`))].join('\n')+'\n');
  phase('firewall_apply');
  firewall(endpoints);
  failures=denied;
  applied=new Map(state.filter(value=>value.policy).map(value=>[value.binding.projectId,value.policy!.version]));
 }
 async function fetchPolicy(entry:Stored):Promise<EgressPolicy>{return new Promise((resolve,reject)=>{
  const data=JSON.stringify({projectId:entry.binding.projectId,engineId:entry.binding.engineId,appliedVersion:applied.get(entry.binding.projectId)??null,unreachableSourceIds:failures.get(entry.binding.projectId)??[]});
  const req=request(new URL('/engine-heartbeat',entry.binding.gatewayUrl),{method:'POST',agent:false,ca,cert,key,minVersion:'TLSv1.3',rejectUnauthorized:true,checkServerIdentity:(host,value)=>checkServerIdentity(host,value)??(value.fingerprint256===pin?undefined:new Error('Gateway pin mismatch')),signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json','content-length':Buffer.byteLength(data)}},res=>{
   const chunks:Buffer[]=[];let size=0;res.on('error',reject);res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2*1024*1024)res.destroy(new Error('Policy too large'));else chunks.push(chunk);});res.on('end',()=>{try{if(res.statusCode!==200||!res.complete)throw new Error('Heartbeat refused');resolve(egressPolicy.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch(error){reject(error);}});
  });req.on('error',reject);req.end(data);
 });}
 // Serialize registration, policy application and persistence; no stale async
 // fetch may overwrite a newer registration or acknowledge a partial apply.
 let work=Promise.resolve();
 const queue=(fn:()=>Promise<void>)=>{const next=work.then(fn);work=next.catch(()=>{});return next;};
 await install();await persist();
 const server=createServer((req,res)=>{
  if(req.method!=='POST'||req.url!=='/register'){res.writeHead(404);res.end();req.resume();return;}
  void(async()=>{try{
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const bytes=Buffer.from(chunk as Uint8Array);size+=bytes.length;if(size>4096)throw new Error('Registration too large');chunks.push(bytes);}
   const registration=egressRegistration.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
   const binding={projectId:registration.projectId,engineId:registration.engineId,gatewayUrl:registration.gatewayUrl};
   await queue(async()=>{
    const prior=state.find(value=>value.binding.projectId===binding.projectId);
    if(prior&&JSON.stringify(prior.binding)===JSON.stringify(binding))return;
    if(!prior&&state.length>=32)throw new Error('Too many registrations');
    const previous=state;
    state=[...state.filter(value=>value!==prior),{binding,policy:null}];applied.delete(binding.projectId);
    try{await install();await persist();}catch(error){
     state=previous;applied.clear();
     try{await install();}catch{applied.clear();firewall(bootstrap.sources);}
     throw error;
    }
   });res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({registered:true}));
  }catch{res.writeHead(503);res.end();}})();
 });
 phase('control_listener');
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(egressControlAddress,resolve);});
 let busy=false;
 const timer=setInterval(()=>{if(busy)return;busy=true;void queue(async()=>{
  try{await install();}catch{console.warn({event:'engine.egress_sync_failed',timestamp:new Date().toISOString()});return;}
  for(const entry of state){try{console.info({event:'engine.egress_sync_started',timestamp:new Date().toISOString(),engineId:entry.binding.engineId});const policy=await fetchPolicy(entry);entry.policy=policy;await install();await persist();console.info({event:'engine.egress_sync_completed',timestamp:new Date().toISOString(),engineId:entry.binding.engineId});}catch{console.warn({event:'engine.egress_sync_failed',timestamp:new Date().toISOString()});}}
 }).finally(()=>{busy=false;});},5000);timer.unref();
 phase('readiness_marker');
 await writeFile('/run/egress-ready','ready\n');
 process.once('SIGTERM',()=>{clearInterval(timer);server.close(()=>process.exit(0));});
}
