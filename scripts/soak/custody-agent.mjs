// AGENT PROCESS ONLY. The Application receives public associations, never bundle
// material or device tokens. Spawn with an explicit environment, not process.env.
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {readFileSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {exchangeDue,exchangeRetryMs} from './exchange-policy.ts';
import {certificateMapping} from './manifest.ts';
import {webcrypto,createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {mcpAgent} from '../steps/infrastructure/mcp.ts';
import {clientIdentity} from '../steps/infrastructure/identity.ts';
import {verifyCustodyCells} from './custody-check.ts';
import {xqDevice,DeviceFailure} from '../steps/infrastructure/xq-device.mjs';
// The SDK and all secret-bearing operations stay in this agent subprocess.
globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
for(const name of ['log','info','warn','error','debug'])globalThis.console[name]=()=>{};
if(process.env.OPINTEL_XQ_SENDER_ACCESS_TOKEN)throw new Error('Agent credential boundary invalid');
const identities=new Map(),clients=new Map(),calls=[];
let device;
const mapping=certificateMapping.parse(JSON.parse(readFileSync(process.argv[2],'utf8')));
const outside=p=>{const rel=relative(process.cwd(),p);return rel==='..'||rel.startsWith('../')||isAbsolute(rel);};
const states=new Map();
async function exchange(certificateId,deviceName){
 const entry=mapping.find(m=>m.certificateId===certificateId&&m.deviceName===deviceName);if(!entry)throw new Error('Certificate mapping mismatch');
 const root=realpathSync(entry.bundlePath.startsWith('~/')?join(homedir(),entry.bundlePath.slice(2)):entry.bundlePath);
 if(!outside(root))throw new Error('Certificate path enters repository');
 const result=await device.exchange(certificateId,deviceName,root);identities.set(certificateId,result);return {ok:true,status:result.status,association:result.association};
}
async function ensure(association){
 const id=association.certificateId,prior=states.get(id),identity=identities.get(id);
 if(!exchangeDue(prior,identity?.expires,Date.now()))return prior;
 identities.delete(id);let state;
 try{const result=await exchange(id,association.deviceName);state={ok:true,reason:null,status:result.status,body:null};}
 catch(error){state={ok:false,reason:error instanceof DeviceFailure?error.phase+'_failed':'bundle_failed',status:error instanceof DeviceFailure?error.status:null,body:'Agent certificate exchange failed; no secret-bearing body was reported.'};}
 state={...state,certificateId:id,deviceName:association.deviceName,nextAttempt:Date.now()+exchangeRetryMs};states.set(id,state);process.send?.({exchange:state,startup:!prior});return state;
}

const announce=(id,event,status)=>process.send?.({event,agent:id,status});
async function command(m){
 if(m.op==='configure'){device=await xqDevice(m.apiKey,event=>{calls.splice(0,calls.length,event);});return {ok:true};}
 if(m.op==='associations'){const result=[];for(const entry of mapping){const state=await ensure(entry);if(state.ok)result.push(identities.get(entry.certificateId).association);}return result;}
 if(m.op==='verify-share'){
  const input=z.object({association:z.object({certificateId:z.number().int(),deviceName:z.string()}),locator:z.string().min(1).max(4096),expectedDigest:z.string().regex(/^[a-f0-9]{64}$/u)}).parse(m);
  const entry=mapping.find(value=>value.certificateId===input.association.certificateId&&value.deviceName===input.association.deviceName);
  if(!entry)throw new Error('Certificate mapping mismatch');
  const state=await ensure(entry);if(!state.ok)return {ok:false,status:state.status};
  let share;
  try{const fetched=await device.fetchShare(entry.certificateId,input.locator);share=fetched.share;return {ok:share.length===32&&timingSafeEqual(createHash('sha256').update(share).digest(),Buffer.from(input.expectedDigest,'hex')),status:fetched.status};}
  catch(error){return {ok:false,status:error instanceof DeviceFailure?error.status:null};}finally{share?.fill(0);}
 }
 if(m.op==='connect'){
  const entry=mapping.find(a=>a.certificateId===m.association.certificateId);
  if(!entry||entry.deviceName!==m.association.deviceName)throw new Error('Mapping differs from saved credential association');
  const state=await ensure(m.association);if(!state.ok)return {ok:false,exchange:state};
  const root=realpathSync(entry.bundlePath.startsWith('~/')?join(homedir(),entry.bundlePath.slice(2)):entry.bundlePath);
  const identity=await clientIdentity(root,identities.get(entry.certificateId).association),url=new globalThis.URL(m.url);
  const project=url.pathname.split('/').at(-1),connection=await mcpAgent(new globalThis.URL(url.origin),project,m.key,m.agentId,identity);
  clients.set(m.id,{client:connection.client,association:entry,stored:m.stored});return {ok:true,exchange:state};
 }
 if(m.op==='poll'){for(const {association} of clients.values())await ensure(association);return {ok:true};}
 if(m.op==='complete'){
  const agent=clients.get(m.id);if(!agent)throw new Error('Agent not connected');
  const state=await ensure(agent.association);
  if(!state.ok){announce(m.id,'custody redemption unavailable: '+state.reason,state.status??'unavailable');return {ok:false,stage:'certificate',code:state.reason,status:state.status??undefined};}
  const identity=identities.get(agent.association.certificateId);
  if(!agent.stored||agent.stored.recipientIdentifier!==identity.association.recipientIdentifier)return {ok:false,stage:'certificate',code:'stored_association_missing_or_different'};
  let verified=0;
  for(const bundle of m.output.custody??[]){
   const claims=JSON.parse(Buffer.from(bundle.grant.split('.')[1],'base64url').toString());
   if(claims.rcpt!==m.output.evidenceId)throw new Error('Grant receipt or redemption endpoint mismatch');
   const reply=await agent.client.callTool({name:'opintel.redeem',arguments:{grant:bundle.grant}});
   if(reply.isError){announce(m.id,'Opintel share release refused',String(reply._meta?.code??'refused'));return {ok:false,stage:'release',code:String(reply._meta?.code??'refused')};}
   const second=Buffer.from(reply.structuredContent.share,'base64url');announce(m.id,'Opintel share released',200);
   let first;
   try{
    let fetched;try{fetched=await device.fetchShare(agent.association.certificateId,claims.custody.locator);}catch(error){return {ok:false,stage:'fetch',status:error instanceof DeviceFailure?error.status:undefined};}
    first=fetched.share;announce(m.id,'XQ share retrieval',fetched.status);
    const checked=verifyCustodyCells(m.output,bundle.columns,m.expected,first,second);if(!checked.matches)return {ok:false,stage:'unseal',mismatch:true};verified+=checked.verified;
    announce(m.id,'local unseal verified',200);
   }finally{first?.fill(0);second.fill(0);}
  }
  return {ok:true,verified};
 }
 if(m.op==='close'){for(const {client} of clients.values())await client.close();identities.clear();device.clear();return {ok:true};}
 throw new Error('Unknown agent command');
}
// Serialize certificate exchanges and custody completions; no cache mutation races.
let queue=Promise.resolve();process.on('message',m=>{queue=queue.then(async()=>{try{process.send?.({id:m.requestId,value:await command(m)});}catch{process.send?.({id:m.requestId,error:'Agent custody operation failed (secret-bearing diagnostics suppressed)'});}});});
process.on('disconnect',()=>{process.exit(0);});
