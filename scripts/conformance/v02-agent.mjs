// AGENT PROCESS ONLY. The Application receives public associations, never bundle
// material or device tokens. Spawn with an explicit environment, not process.env.
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {createHash,webcrypto} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {encryptCertificatePayload,decryptCertificateResponse} from '../infrastructure/xq-device-certificate-envelope.mjs';
import {unsealCell,xorShares} from '../../src/modules/release-custody/index.ts';

globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
for(const name of ['log','info','warn','error','debug'])globalThis.console[name]=()=>{};
const {XQSDK,FetchKey,ServerResponse}=await import('@xqmsg/jssdk-core');
const apiKey=process.env.OPINTEL_XQ_API_KEY;
if(!apiKey||process.env.OPINTEL_XQ_SENDER_ACCESS_TOKEN)throw new Error('Agent credential boundary invalid');
const endpoints=new XQSDK({XQ_API_KEY:apiKey});
const base=endpoints.SUBSCRIPTION_SERVER_URL.replace(/\/$/u,'');
const validationBase=endpoints.VALIDATION_SERVER_URL.replace(/\/$/u,'');
if(base!=='https://subscription.xqmsg.net/v2')throw new Error('Unexpected XQ endpoint');
const sensitive=[apiKey];
const redact=body=>sensitive.filter(Boolean).reduce((s,v)=>s.split(v).join('[redacted]'),body).replace(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+/gu,'[address redacted]').replace(/[A-Za-z0-9+/_-]{43,}={0,2}/gu,'[opaque value redacted]');
const identities=new Map(),clients=new Map(),results=new Map(),calls=[];
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);}
const request=async(path,method,headers,body)=>{
 const target=path.startsWith('/')?base+path:path;
 if(!target.startsWith(base+'/')&&!target.startsWith(validationBase+'/key/'))throw new Error('Unexpected XQ request endpoint');
 const entry={operation:target.startsWith(validationBase+'/key/')?'fetch':path,at:new Date().toISOString()};calls.push(entry);
 const response=await globalThis.fetch(target,{method,headers:{'api-key':apiKey,...headers},body,signal:globalThis.AbortSignal.timeout(15000),redirect:'error'});
 entry.status=response.status;const raw=await response.text();entry.body=response.ok&&path!=='/time'?'[successful secret-bearing body redacted]':redact(raw);return {status:response.status,ok:response.ok,body:raw};
};
async function exchange(certificateId,deviceName){
 if(identities.has(certificateId))throw new Error('Certificate exchange already attempted');
 identities.set(certificateId,null);
 const paths=files(join(homedir(),'.xq','v02',String(certificateId)));
 const certPath=paths.find(p=>p.endsWith('/client.crt')),transportPath=paths.find(p=>p.endsWith('/transport.key')),privatePath=paths.find(p=>p.endsWith('/client.key'));
 if(!certPath||!transportPath||!privatePath)throw new Error('Bundle file names do not match expected public format');
 const cert=readFileSync(certPath,'utf8');const pem=cert.includes('-----BEGIN CERTIFICATE-----')?cert:Buffer.from(cert.trim(),'base64').toString('utf8');
 if(!pem.startsWith('-----BEGIN CERTIFICATE-----'))throw new Error('Certificate format invalid');
 const privateText=readFileSync(privatePath,'utf8'),privateBytes=privateText.includes('-----BEGIN')?Buffer.from(privateText):Buffer.from(privateText.trim(),'base64');
 const transport=readFileSync(transportPath,'utf8').trim();sensitive.push(transport,pem,cert,privateText);
 const time=await request('/time','GET',{});
 if(!time.ok||!/^\d+$/u.test(time.body.trim()))throw new Error('Server time failed');
 const r=await request('/authorize/certificate/'+certificateId,'POST',{'content-type':'application/json'},encryptCertificatePayload({crt:Buffer.from(pem).toString('base64'),device:deviceName,ver:3,ts:Number(time.body.trim())},transport));
 if(!r.ok)return {ok:false,status:r.status,body:redact(r.body)};
 const decoded=decryptCertificateResponse(r.body,transport),response=JSON.parse(decoded.toString());decoded.fill(0);
 // OpenSSL reads the private key from a pipe, not a temporary file. No key is
 // put in argv or inherited by the Application. Ciphertext goes through stdin.
 const unwrapped=await new Promise((resolve,reject)=>{
  const child=spawn('openssl',['pkeyutl','-decrypt','-inkey','/dev/fd/3','-keyform',privateBytes.toString('ascii',0,20).includes('-----BEGIN')?'PEM':'DER','-pkeyopt','rsa_padding_mode:pkcs1'],{stdio:['pipe','pipe','ignore','pipe'],timeout:15000});
  const chunks=[];child.stdout.on('data',chunk=>chunks.push(chunk));child.on('error',()=>reject(new Error('Device token unwrap failed')));child.on('exit',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('Device token unwrap failed')));
  child.stdio[3].end(privateBytes);child.stdin.end(Buffer.from(response.access_token,'base64'));
 });privateBytes.fill(0);
 if(!unwrapped.length)throw new Error('Empty device token');
 const token=unwrapped.toString().trim();unwrapped.fill(0);sensitive.push(token);
 const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
 const addresses=[];const walk=v=>{if(typeof v==='string'&&v.endsWith('.trusted.local')&&v.includes('@'))addresses.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(payload);
 const unique=[...new Set(addresses)];if(unique.length!==1)throw new Error('No unique provider-issued recipient');
 const association={certificateId,deviceName,recipientIdentifier:unique[0]};identities.set(certificateId,{token,association});
 return {ok:true,status:r.status,association};
}
async function command(m){
 if(m.op==='exchange')return exchange(m.certificateId,m.deviceName);
 if(m.op==='connect'){
  const c=new Client({name:'v02-agent',version:'1'});await c.connect(new StreamableHTTPClientTransport(new globalThis.URL(m.url),{requestInit:{headers:{authorization:'Bearer '+m.key,'x-opintel-agent-id':m.agentId}}}));clients.set(m.id,c);return {ok:true};
 }
 if(m.op==='query'){
  const response=await clients.get(m.id).callTool({name:'opintel.query',arguments:{sql:m.sql}});
  if(response.isError)return {ok:false,code:response._meta?.code};
  const output=response.structuredContent,grant=output?.custody?.[0]?.grant;
  if(!grant)return {ok:false,code:'missing_grant'};
  const claims=JSON.parse(Buffer.from(grant.split('.')[1],'base64url').toString());results.set(m.result,{output,claims,grant,client:clients.get(m.id)});
  return {ok:true,output,grantId:claims.jti};
 }
 if(m.op==='fetch'){
  const identity=identities.get(m.certificateId),r=results.get(m.result);const sdk=new XQSDK({XQ_API_KEY:apiKey});
  sdk.getCache().putActiveProfile(identity.association.recipientIdentifier);sdk.getCache().putXQAccess(identity.association.recipientIdentifier,identity.token);
  let status;
  sdk.makeRequest=async(url,method,_service,headers)=>{
   if(headers.Authorization!=='Bearer '+identity.token||!url.startsWith(validationBase+'/key/'))throw new Error('Wrong fetch bearer or endpoint');
   const reply=await request(url,method,headers);status=reply.status;let payload;try{payload=JSON.parse(reply.body);}catch{payload=reply.body;}
   return new ServerResponse(reply.ok?ServerResponse.OK:ServerResponse.ERROR,reply.status,payload);
  };
  const fetched=await new FetchKey(sdk).supplyAsync({locatorKey:r.claims.custody.locator});sdk.getCache().clearAllProfiles();
  if(fetched.status!==ServerResponse.OK)return {ok:false,status};
  if(typeof fetched.payload!=='string')throw new Error('Unexpected share shape');
  const share=Buffer.from(fetched.payload,'base64url');r.first=share;
  return {ok:true,status,bytes:share.length,digest:createHash('sha256').update(share).digest('hex')};
 }
 if(m.op==='redeem'){
  const r=results.get(m.result),response=await r.client.callTool({name:'opintel.redeem',arguments:{grant:r.grant}});
  if(response.isError)return {ok:false,code:response._meta?.code};
  r.second=Buffer.from(response.structuredContent.share,'base64url');return {ok:true,meaning:response.structuredContent.evidenceMeaning};
 }
 if(m.op==='unseal'){
  const r=results.get(m.result),index=r.output.columns.findIndex(c=>c.name===m.column),key=xorShares(r.first,r.second);
  const values=r.output.rows.map((row,i)=>unsealCell(row[index],key,r.output.evidenceId,m.column,i));
  const alone=share=>r.output.rows.every((row,i)=>{try{unsealCell(row[index],share,r.output.evidenceId,m.column,i);return false;}catch{return true;}});
  const answer={matches:JSON.stringify(values)===JSON.stringify(m.expected),firstAloneRefused:alone(r.first),secondAloneRefused:alone(r.second)};key.fill(0);return answer;
 }
 if(m.op==='calls')return calls;
 if(m.op==='close'){for(const c of clients.values())await c.close();return {ok:true};}
 throw new Error('Unknown agent command');
}
process.on('message',async m=>{try{process.send({id:m.requestId,value:await command(m)});}catch(error){process.send({id:m.requestId,error:'Agent '+m.op+' failed: '+redact(error instanceof Error?error.message:'unclassified failure'),calls});}});
