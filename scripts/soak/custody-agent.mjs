// AGENT PROCESS ONLY. The Application receives public associations, never bundle
// material or device tokens. Spawn with an explicit environment, not process.env.
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {readFileSync,readdirSync,realpathSync,statSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {exchangeDue,exchangeRetryMs} from './exchange-policy.ts';
import {deviceAssociation} from './device-subject.ts';
import {certificateMapping} from './manifest.ts';
import {spawn} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {encryptCertificatePayload,decryptCertificateResponse} from '../infrastructure/xq-device-certificate-envelope.mjs';
import {verifyCustodyCells} from './custody-check.ts';

globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
for(const name of ['log','info','warn','error','debug'])globalThis.console[name]=()=>{};
const {XQSDK,FetchKey,ServerResponse}=await import('@xqmsg/jssdk-core');
const apiKey=process.env.OPINTEL_XQ_API_KEY??'';
if(process.env.OPINTEL_XQ_SENDER_ACCESS_TOKEN)throw new Error('Agent credential boundary invalid');
const endpoints=new XQSDK({XQ_API_KEY:apiKey||'missing-key'});
const base=endpoints.SUBSCRIPTION_SERVER_URL.replace(/\/$/u,'');
const validationBase=endpoints.VALIDATION_SERVER_URL.replace(/\/$/u,'');
if(base!=='https://subscription.xqmsg.net/v2')throw new Error('Unexpected XQ endpoint');
const sensitive=apiKey?[apiKey]:[];
const redact=body=>sensitive.filter(Boolean).reduce((s,v)=>s.split(v).join('[redacted]'),body).replace(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+/gu,'[address redacted]').replace(/[A-Za-z0-9+/_-]{43,}={0,2}/gu,'[opaque value redacted]');
const identities=new Map(),clients=new Map(),calls=[];
const mapping=certificateMapping.parse(JSON.parse(readFileSync(process.argv[2],'utf8')));
const outside=p=>{const rel=relative(process.cwd(),p);return rel==='..'||rel.startsWith('../')||isAbsolute(rel);};
const states=new Map();
function files(directory){const actual=realpathSync(directory);if(!outside(actual))throw new Error('Certificate path enters repository');return readdirSync(actual,{withFileTypes:true}).flatMap(entry=>entry.isSymbolicLink()?[]:entry.isDirectory()?files(join(actual,entry.name)):[join(actual,entry.name)]);}
const request=async(path,method,headers,body)=>{
 const target=path.startsWith('/')?base+path:path;
 if(!target.startsWith(base+'/')&&!target.startsWith(validationBase+'/key/'))throw new Error('Unexpected XQ request endpoint');
 const entry={operation:target.startsWith(validationBase+'/key/')?'fetch':path,at:new Date().toISOString()};calls.splice(0,calls.length,entry);
 const response=await globalThis.fetch(target,{method,headers:{'api-key':apiKey,...headers},body,signal:globalThis.AbortSignal.timeout(15000),redirect:'error'});
 entry.status=response.status;const raw=await response.text();entry.body=response.ok&&path!=='/time'?'[successful secret-bearing body redacted]':redact(raw);return {status:response.status,ok:response.ok,body:raw};
};
let exchangePhase='bundle';
async function exchange(certificateId,deviceName){
 exchangePhase='bundle';calls.length=0;
 if(identities.has(certificateId))throw new Error('Certificate exchange already attempted');
 identities.set(certificateId,null);
 const entry=mapping.find(m=>m.certificateId===certificateId&&m.deviceName===deviceName);if(!entry)throw new Error('Certificate mapping mismatch');
 const root=realpathSync(entry.bundlePath.startsWith('~/')?join(homedir(),entry.bundlePath.slice(2)):entry.bundlePath);
 if(!outside(root)||statSync(root).mode&0o077)throw new Error('Bundle must be outside repository with directory mode 700');
 const paths=files(root);
 if(['client.crt','transport.key','client.key'].some(name=>paths.filter(p=>p.endsWith('/'+name)).length!==1))throw new Error('Ambiguous or missing bundle file');
 const certPath=paths.find(p=>p.endsWith('/client.crt')),transportPath=paths.find(p=>p.endsWith('/transport.key')),privatePath=paths.find(p=>p.endsWith('/client.key'));
 if(!certPath||!transportPath||!privatePath)throw new Error('Bundle file names do not match expected public format');
 for(const file of [certPath,transportPath,privatePath])if(statSync(file).mode&0o077)throw new Error('Bundle files must have mode 600');
 const cert=readFileSync(certPath,'utf8');const pem=cert.includes('-----BEGIN CERTIFICATE-----')?cert:Buffer.from(cert.trim(),'base64').toString('utf8');
 if(!pem.startsWith('-----BEGIN CERTIFICATE-----'))throw new Error('Certificate format invalid');
 const privateText=readFileSync(privatePath,'utf8'),privateBytes=privateText.includes('-----BEGIN')?Buffer.from(privateText):Buffer.from(privateText.trim(),'base64');
 const transport=readFileSync(transportPath,'utf8').trim();sensitive.push(transport,pem,cert,privateText);
 exchangePhase='server_time';
 const time=await request('/time','GET',{});
 if(!time.ok)return {ok:false,status:time.status,body:redact(time.body),reason:'time_refused'};
 if(!/^\d+$/u.test(time.body.trim()))return {ok:false,reason:'invalid_server_time'};
 exchangePhase='certificate_authorization';
 const r=await request('/authorize/certificate/'+certificateId,'POST',{'content-type':'application/json'},encryptCertificatePayload({crt:Buffer.from(pem).toString('base64'),device:deviceName,ver:3,ts:Number(time.body.trim())},transport));
 if(!r.ok)return {ok:false,status:r.status,body:redact(r.body),reason:'certificate_exchange_refused'};
 exchangePhase='response_decryption';
 const decoded=decryptCertificateResponse(r.body,transport),response=JSON.parse(decoded.toString());decoded.fill(0);
 // OpenSSL reads the private key from a pipe, not a temporary file. No key is
 // put in argv or inherited by the Application. Ciphertext goes through stdin.
 exchangePhase='token_unwrap';
 const unwrapped=await new Promise((resolve,reject)=>{
  const child=spawn('openssl',['pkeyutl','-decrypt','-inkey','/dev/fd/3','-keyform',privateBytes.toString('ascii',0,20).includes('-----BEGIN')?'PEM':'DER','-pkeyopt','rsa_padding_mode:pkcs1'],{stdio:['pipe','pipe','ignore','pipe'],timeout:15000});
  const chunks=[];child.stdout.on('data',chunk=>chunks.push(chunk));child.on('error',()=>reject(new Error('Device token unwrap failed')));child.on('exit',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('Device token unwrap failed')));
  child.stdio[3].end(privateBytes);child.stdin.end(Buffer.from(response.access_token,'base64'));
 });privateBytes.fill(0);
 if(!unwrapped.length)throw new Error('Empty device token');
 const token=unwrapped.toString().trim();unwrapped.fill(0);// Token never crosses IPC or enters the log.
sensitive.push(token);
 const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
 const association=deviceAssociation(payload,certificateId,deviceName);
 sensitive.push(association.recipientIdentifier);const team=/@([^@]+)\.trusted\.local$/u.exec(association.recipientIdentifier)?.[1];if(team)sensitive.push(team);
 identities.set(certificateId,{token,association,expires:payload.exp});
 return {ok:true,status:r.status,association};
}

const announce=(id,event,status)=>process.send?.({event,agent:id,status});
async function ensure(association){
 const id=association.certificateId,prior=states.get(id),identity=identities.get(id);
 if(!exchangeDue(prior,identity?.expires,Date.now()))return prior;
 if(identity){const old=sensitive.indexOf(identity.token);if(old>=0)sensitive.splice(old,1);}identities.delete(id);
 let state;
 try{const result=apiKey?await exchange(id,association.deviceName):{ok:false,reason:'general_api_key_missing',body:'OPINTEL_XQ_API_KEY is missing; governed MCP queries remain available.'};
  if(!result.ok)state={ok:false,reason:result.reason??'certificate_exchange_refused',status:result.status??null,body:result.body??null};
  else state={ok:true,reason:null,status:result.status,body:null};
 }catch(error){const code=error&&['ENOENT','EACCES','EPERM'].includes(error.code)?' ('+error.code+')':'';state={ok:false,reason:exchangePhase+'_failed',status:calls.at(-1)?.status??null,body:'Local '+exchangePhase+' operation failed'+code+'; no printable HTTP failure body. Secret-bearing diagnostics suppressed.'};}
 if(!state.ok)identities.delete(id);
 state={...state,certificateId:id,deviceName:association.deviceName,nextAttempt:Date.now()+exchangeRetryMs};states.set(id,state);
 process.send?.({exchange:state,startup:!prior});return state;
}
async function command(m){
 if(m.op==='associations'){const result=[];for(const entry of mapping){const state=await ensure(entry);if(state.ok)result.push(identities.get(entry.certificateId).association);}return result;}
 if(m.op==='connect'){
  const entry=mapping.find(a=>a.certificateId===m.association.certificateId);
  if(!entry||entry.deviceName!==m.association.deviceName)throw new Error('Mapping differs from saved credential association');
  const client=new Client({name:'soak-custody-agent',version:'1'});await client.connect(new StreamableHTTPClientTransport(new globalThis.URL(m.url),{requestInit:{headers:{authorization:'Bearer '+m.key,'x-opintel-agent-id':m.agentId}}}));clients.set(m.id,{client,association:entry,stored:m.stored});
  const state=await ensure(m.association);return {ok:true,exchange:state};
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
    const sdk=new XQSDK({XQ_API_KEY:apiKey});sdk.getCache().putActiveProfile(identity.association.recipientIdentifier);sdk.getCache().putXQAccess(identity.association.recipientIdentifier,identity.token);
    let status;
    sdk.makeRequest=async(url,method,_service,headers)=>{if(headers.Authorization!=='Bearer '+identity.token||!url.startsWith(validationBase+'/key/'))throw new Error('Fetch boundary violation');const r=await request(url,method,headers);status=r.status;let payload;try{payload=JSON.parse(r.body);}catch{payload=r.body;}return new ServerResponse(r.ok?ServerResponse.OK:ServerResponse.ERROR,r.status,payload);};
    const fetched=await new FetchKey(sdk).supplyAsync({locatorKey:claims.custody.locator});sdk.getCache().clearAllProfiles();announce(m.id,'XQ share retrieval',status);
    if(fetched.status!==ServerResponse.OK||typeof fetched.payload!=='string')return {ok:false,stage:'fetch',status};
    first=Buffer.from(fetched.payload,'base64url');
    const checked=verifyCustodyCells(m.output,bundle.columns,m.expected,first,second);if(!checked.matches)return {ok:false,stage:'unseal',mismatch:true};verified+=checked.verified;
    announce(m.id,'local unseal verified',200);
   }finally{first?.fill(0);second.fill(0);}
  }
  return {ok:true,verified};
 }
 if(m.op==='close'){for(const {client} of clients.values())await client.close();identities.clear();sensitive.length=0;return {ok:true};}
 throw new Error('Unknown agent command');
}
// Serialize certificate exchanges and custody completions; no cache mutation races.
let queue=Promise.resolve();process.on('message',m=>{queue=queue.then(async()=>{try{process.send?.({id:m.requestId,value:await command(m)});}catch{process.send?.({id:m.requestId,error:'Agent custody operation failed (secret-bearing diagnostics suppressed)'});}});});
process.on('disconnect',()=>{process.exit(0);});
