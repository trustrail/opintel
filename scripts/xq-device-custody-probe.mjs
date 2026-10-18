import process from 'node:process';
import {Buffer} from 'node:buffer';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes,randomUUID,webcrypto} from 'node:crypto';
import {parse} from 'dotenv';
import {encryptCertificatePayload,decryptCertificateResponse,decryptDeviceAccessToken} from './infrastructure/xq-device-certificate-envelope.mjs';

// One authorized chain. Device access token remains in this process only.
const output='tmp/xq-device-custody-chain-result.json';
const locatorFile='tmp/xq-device-custody-locator-private.json';
if(existsSync(output)||existsSync(locatorFile))throw new Error('Attempt already recorded.');
const env=parse(readFileSync('.env','utf8'));
for(const name of ['OPINTEL_XQ_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'])if(!env[name])throw new Error('Required configuration missing.');
const directory=join(homedir(),'.xq/device-probe-b6m7vvn5');
const pemBytes=Buffer.from(readFileSync(join(directory,'client.crt'),'utf8').trim(),'base64');
if(!pemBytes.toString('utf8').startsWith('-----BEGIN CERTIFICATE-----'))throw new Error('Unexpected certificate format.');
const crt=pemBytes.toString('base64');
const transportKey=readFileSync(join(directory,'transport.key'),'utf8').trim();
globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
for(const name of ['log','info','warn','error','debug'])globalThis.console[name]=()=>{};
const {XQSDK,GeneratePacket,FetchKey,ServerResponse}=await import('@xqmsg/jssdk-core');
const sdk=new XQSDK({XQ_API_KEY:env.OPINTEL_XQ_API_KEY});
const base=sdk.SUBSCRIPTION_SERVER_URL.replace(/\/$/u,'');
if(base!=='https://subscription.xqmsg.net/v2')throw new Error('Unexpected subscription URL.');
const report={at:new Date().toISOString(),calls:[],storageType:8};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const secrets=[...Object.values(env),crt,transportKey,pemBytes.toString('utf8')].filter(v=>typeof v==='string'&&v.length>0);
const redact=v=>typeof v==='string'?secrets.reduce((s,k)=>s.split(k).join('[redacted]'),v).replace(/[\w.+-]+@[\w.-]+/gu,'[address redacted]'):v===null?v:Array.isArray(v)?v.map(redact):typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/token|key|subject|team|business|email|address|secret/i.test(k)?'[redacted]':redact(x)])):v;
let operation='time';
save();
const request=async(url,method,headers,body)=>{
 const call={operation,at:new Date().toISOString(),method,url:url.replace(/\/key\/[^/]+$/u,'/key/<locator>')};report.calls.push(call);save();
 const response=await globalThis.fetch(url,{method,headers,body,signal:globalThis.AbortSignal.timeout(15000),redirect:'error'});
 const raw=await response.text();call.status=response.status;
 let value;try{value=JSON.parse(raw);}catch{value=raw;}
 if(!response.ok)call.body=redact(value);save();return {ok:response.ok,status:response.status,raw,value};
};
sdk.makeRequest=async(url,method,_service,headers,payload,requiresApiKey)=>{
 const h={...headers};if(requiresApiKey)h['api-key']=env.OPINTEL_XQ_API_KEY;
 const plain=h['content-type']==='text/plain;charset=UTF-8';if(!plain)h['content-type']='application/json';
 if(operation==='fetch-device'&&h.Authorization!=='Bearer '+deviceToken)throw new Error('Wrong fetch bearer.');
 const r=await request(url,method,h,method==='GET'?undefined:plain?payload?.data:JSON.stringify(payload));
 return new ServerResponse(r.ok?ServerResponse.OK:ServerResponse.ERROR,r.status,r.value);
};
let deviceToken;
try{
 const time=await request(base+'/time','GET',{'api-key':env.OPINTEL_XQ_API_KEY});
 if(!time.ok||!/^\d+$/u.test(time.raw.trim())||!Number.isSafeInteger(Number(time.raw.trim())))throw new Error('Server time failed.');
 operation='certificate-exchange';
 const encrypted=encryptCertificatePayload({crt,device:'opintelprobe',ver:3,ts:Number(time.raw.trim())},transportKey);
 const exchange=await request(base+'/authorize/certificate/223','POST',{'api-key':env.OPINTEL_XQ_API_KEY,'content-type':'application/json'},encrypted);
 if(!exchange.ok)throw new Error('Certificate exchange refused.');
 operation='response-unwrap';
 const decoded=decryptCertificateResponse(exchange.raw,transportKey);report.responseTagVerified=true;
 const payload=JSON.parse(decoded.toString('utf8'));decoded.fill(0);
 const bytes=decryptDeviceAccessToken(Buffer.from(payload.access_token,'base64'),join(directory,'client-private.der'));
 deviceToken=bytes.toString('utf8').trim();bytes.fill(0);secrets.push(deviceToken);report.unwrapSucceeded=true;
 operation='claims';
 const parts=deviceToken.split('.');if(parts.length!==3)throw new Error('Token is not JWT-shaped.');
 const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
 const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
 const fields=[];const identityCandidates=[];
 const walk=(v,path)=>{
  if(v!==null&&typeof v==='object'){fields.push({path,type:Array.isArray(v)?'array':'object'});for(const [k,x] of Object.entries(v))walk(x,path+'.'+k);return;}
  const field={path,type:v===null?'null':typeof v};
  if(typeof v==='string'&&v.includes('@'))field.shape='address';
  if(typeof v==='string'&&/^opintelprobe_crt_223@[^@]+\.trusted\.local$/u.test(v))identityCandidates.push({path,value:v});
  if(/\.(role|roles|type|typ)$/iu.test(path)&&(typeof v==='number'||typeof v==='string'&&!v.includes('@')&&!/^\d+$/u.test(v))&&!secrets.includes(String(v)))field.value=v;
  if(/\.(iat|exp|nbf)$/u.test(path)&&typeof v==='number'){field.value=v;field.utc=new Date(v*1000).toISOString();field.unit='seconds since Unix epoch';}
  fields.push(field);
 };
 walk(header,'header');walk(claims,'payload');report.claims=fields;report.signature='left untouched; decoded only, not cryptographically verified';
 report.subjectClaim=Object.hasOwn(claims,'sub')?'payload.sub':'no top-level sub';
 report.explicitTeamOrBusinessClaims=fields.filter(f=>/(team|business|\bbid\b)/iu.test(f.path)).map(f=>f.path);
 if(identityCandidates.length===0)throw new Error('Expected trusted.local identity absent from token; cannot confirm recipient.');
 const recipient=identityCandidates[0].value;
 if(identityCandidates.some(x=>x.value!==recipient)||recipient!=='opintelprobe_crt_223@'+env.OPINTEL_XQ_TEAM_ID+'.trusted.local')throw new Error('Device identity does not match configured team.');
 report.deviceIdentityClaims=identityCandidates.map(x=>x.path);report.recipient='opintelprobe_crt_223@<team>.trusted.local';report.teamSegmentMatchesConfiguredTeam=true;secrets.push(recipient);save();
 operation='generate-packet';
 sdk.getCache().putActiveProfile(env.OPINTEL_XQ_SENDER_ALIAS);sdk.getCache().putXQAccess(env.OPINTEL_XQ_SENDER_ALIAS,env.OPINTEL_XQ_SENDER_ACCESS_TOKEN);
 const share=randomBytes(32).toString('base64url');secrets.push(share);
 const packet=await new GeneratePacket(sdk).supplyAsync({key:share,recipients:[recipient],expires:1,dor:true,type:8,meta:{receipt:randomUUID()}});
 if(packet.status!==ServerResponse.OK||typeof packet.payload!=='string')throw new Error('Escrow failed.');
 const locator=packet.payload;secrets.push(locator);writeFileSync(locatorFile,JSON.stringify({locator})+'\n',{mode:0o600,flag:'wx'});report.locatorRecorded=locatorFile;
 operation='fetch-device';
 sdk.getCache().putActiveProfile(recipient);sdk.getCache().putXQAccess(recipient,deviceToken);
 const fetched=await new FetchKey(sdk).supplyAsync({locatorKey:locator});
 report.fetchSucceeded=fetched.status===ServerResponse.OK;
 report.shareMatchesByteForByte=report.fetchSucceeded&&typeof fetched.payload==='string'&&Buffer.from(fetched.payload,'utf8').equals(Buffer.from(share,'utf8'));
 report.completed=report.shareMatchesByteForByte;
}catch{report.stoppedAt=operation;}
finally{save();process.stdout.write(JSON.stringify(report,null,2)+'\n');}
