import process from 'node:process';
import {Buffer} from 'node:buffer';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes,webcrypto} from 'node:crypto';
import {parse} from 'dotenv';
import {encryptCertificatePayload,decryptCertificateResponse,decryptDeviceAccessToken} from './infrastructure/xq-device-certificate-envelope.mjs';

// One-shot operator probe, not production configuration or an SDK auth adapter.
const [bundleArgument,certArgument,deviceArgument='opintel-certificate-probe']=process.argv.slice(2);
const identityVariant=process.argv.includes('--identity-device');
const env=parse(readFileSync('.env','utf8'));
let device=deviceArgument;
if(identityVariant){
 if(deviceArgument==='agent-alias'){
  const contacts=JSON.parse(readFileSync('tmp/xq-device-contacts-private.json','utf8'));
  const prior=JSON.parse(readFileSync('tmp/xq-contact-id-recipient-result.json','utf8'));
  const contact=contacts.contacts.find(c=>c.id===prior.contactId&&c.role==='Alias'&&c.state==='Validated');
  if(!contact||typeof contact.email!=='string')throw new Error('Prior enrolled alias unavailable.');
  device=contact.email;
 }else if(deviceArgument==='owner')device=env.OPINTEL_XQ_SENDER_ALIAS;
 else throw new Error('Unknown identity variant.');
}
const directory=resolve(bundleArgument??'');
const bareDer=process.argv.includes('--bare-der-exchange-only');
const pemRetry=process.argv.includes('--pem-confirmed-exchange-only');
const matrixDevice=process.argv.includes('--device-matrix');
const encodedPem=process.argv.includes('--base64-pem-unwrap-only');
const referenceVariant=process.argv.find(v=>v.startsWith('--reference-crt='))?.split('=')[1];
if(referenceVariant&&!['pem','base64-pem','der'].includes(referenceVariant))throw new Error('Unknown reference variant.');
const exchangeOnly=pemRetry||bareDer||process.argv.includes('--standard-base64-exchange-only');
const certId=Number(certArgument);
if(!directory.startsWith(join(homedir(),'.xq')+'/')||!Number.isSafeInteger(certId)||certId<=0||typeof device!=='string'||device.length<1||(!identityVariant&&device.length>48))throw new Error('Invalid probe arguments.');
const output=referenceVariant?'tmp/xq-device-certificate-reference-'+referenceVariant+'-result.json':encodedPem?'tmp/xq-device-certificate-base64-pem-lf-result.json':identityVariant?'tmp/xq-device-certificate-identity-'+deviceArgument+'-result.json':matrixDevice?'tmp/xq-device-certificate-matrix-'+Buffer.from(device).toString('hex')+'-'+certId+'.json':pemRetry?'tmp/xq-device-certificate-pem-confirmed-result.json':bareDer?'tmp/xq-device-certificate-bare-der-result.json':exchangeOnly?'tmp/xq-device-certificate-standard-base64-result.json':'tmp/xq-device-certificate-tutorial-result.json';
if(existsSync(output))throw new Error('Attempt already recorded; no retries.');
const apiKey=env.OPINTEL_XQ_API_KEY,recipient=env.OPINTEL_XQ_SENDER_ALIAS;
if(!apiKey||!recipient||!recipient.includes('@')||recipient.endsWith('@_')||recipient.includes(','))throw new Error('General API key and one enumerated recipient required.');
const pem=readFileSync(join(directory,'client.pem'),'utf8').trim();
const encodedPemText=encodedPem?Buffer.from(readFileSync(join(directory,'client.crt'),'utf8').trim(),'base64').toString('utf8').replace(/\r\n/gu,'\n').trimEnd()+'\n':undefined;
if(encodedPem&&!/^-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE-----\n$/u.test(encodedPemText))throw new Error('Unexpected PEM format.');
const bundleCertificate=referenceVariant?readFileSync(join(directory,'client.crt')):undefined;
const fullPem=referenceVariant?(bundleCertificate.toString('utf8').startsWith('-----BEGIN CERTIFICATE-----')?bundleCertificate:Buffer.from(bundleCertificate.toString('utf8').trim(),'base64')).toString('utf8'):undefined;
if(referenceVariant&&!/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----(?:\r?\n)?$/u.test(fullPem))throw new Error('Unexpected source certificate format.');
const referenceCrt=referenceVariant==='pem'?fullPem:referenceVariant==='base64-pem'?Buffer.from(fullPem,'utf8').toString('base64'):referenceVariant==='der'?fullPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|[\r\n]/gu,''):undefined;
const crt=referenceVariant?referenceCrt:encodedPem?Buffer.from(encodedPemText,'utf8').toString('base64'):bareDer?pem.replace(/^-----BEGIN CERTIFICATE-----\r?\n/u,'').replace(/\r?\n-----END CERTIFICATE-----$/u,'').replace(/[\r\n]/gu,''):pem;
if(bareDer&&(!/^[A-Za-z0-9+/]+={0,2}$/u.test(crt)||Buffer.from(crt,'base64').toString('base64')!==crt))throw new Error('Certificate body is not canonical base64 DER.');
const transportKey=readFileSync(join(directory,'transport.key'),'utf8').trim();
const privateKeyPath=join(directory,'client-private.der');
globalThis.window={navigator:{platform:'Node'},crypto:webcrypto};
for(const name of ['log','info','warn','error','debug'])globalThis.console[name]=()=>{};
const {XQSDK}=await import('@xqmsg/jssdk-core');
const sdk=new XQSDK({XQ_API_KEY:apiKey});
const base=sdk.SUBSCRIPTION_SERVER_URL.replace(/\/$/u,'');
if(referenceVariant&&base+'/authorize/certificate/'+certId!=='https://subscription.xqmsg.net/v2/authorize/certificate/223')throw new Error('Unexpected reference URL.');
const report={at:new Date().toISOString(),certId,subscriptionBase:base,recipientKind:'single enumerated configured sender address; not a group',steps:[]};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
save();
const secrets=[...Object.values(env),device,crt,transportKey].filter(v=>typeof v==='string'&&v.length>3);
const sanitize=v=>typeof v==='string'?secrets.reduce((s,k)=>s.split(k).join('[redacted]'),v).replace(/[\w.+-]+@[\w.-]+/gu,'[address redacted]'):v===null?v:Array.isArray(v)?v.map(sanitize):typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/token|key|crt|cert|address|email|team|secret/i.test(k)?'[redacted]':sanitize(x)])):v;
let step='time';
const request=async(method,path,body,bearer)=>{
 const record={step,at:new Date().toISOString(),method,path:path.startsWith('/key/')?'/key/<locator>':path};report.steps.push(record);save();
 const headers={'api-key':apiKey};if(body!==undefined)headers['content-type']='application/json';if(bearer)headers.Authorization='Bearer '+bearer;
 if(step==='certificate-exchange'){if(new globalThis.URL(base).hostname!=='subscription.xqmsg.net'||bearer!==undefined||Object.keys(headers).some(k=>k.toLowerCase()==='authorization'))throw new Error('Unexpected authorization headers or host.');report.authorizationHeaders={apiKeySource:'OPINTEL_XQ_API_KEY',names:Object.keys(headers),bearerPresent:false};}
 const r=await globalThis.fetch(base+path,{method,headers,body,signal:globalThis.AbortSignal.timeout(15000),redirect:'error'});
 record.status=r.status;const raw=await r.text();
 if(!r.ok){let value;try{value=JSON.parse(raw);}catch{value=raw;}record.body=sanitize(value);save();throw new Error('Provider refused.');}
 save();return raw;
};
try{
 const time=(await request('GET','/time')).trim();
 if(!/^\d+$/u.test(time)||!Number.isSafeInteger(Number(time)))throw new Error('Server time was not a safe bare integer.');
 report.serverTimeAccepted=true;
 step='certificate-exchange';
 const encrypted=encryptCertificatePayload({crt,device,ver:3,ts:Number(time)},transportKey);
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encrypted)||Buffer.from(encrypted,'base64').toString('base64')!==encrypted)throw new Error('Envelope is not canonical standard base64.');
 report.requestChecks={certificateFormat:referenceVariant??(encodedPem?'standard base64 of full PEM, LF line endings and final LF':bareDer?'bare base64 DER':'trimmed PEM'),canonicalStandardBase64:true,urlSafeCharacters:false,bareStringBody:true,jsonQuoted:false,objectWrapped:false,contentType:'application/json'};
 save();process.stdout.write('Pre-send checks: canonical standard base64; bare unquoted string; Content-Type application/json.\n');
 const response=await request('POST','/authorize/certificate/'+certId,encrypted);
 if(exchangeOnly){report.exchangeSucceeded=true;report.responseBody='[encrypted response withheld]';throw new Error('Exchange-only attempt complete.');}
 step='response-envelope-decryption';
 const decoded=decryptCertificateResponse(response,transportKey);report.responseTagVerified=true;
 const payload=JSON.parse(decoded.toString('utf8'));decoded.fill(0);
 if(typeof payload.access_token!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/u.test(payload.access_token))throw new Error('Encrypted access_token is not base64.');
 step='rsa-token-decryption';
 const tokenBytes=decryptDeviceAccessToken(Buffer.from(payload.access_token,'base64'),privateKeyPath);
 const token=tokenBytes.toString('utf8').trim();tokenBytes.fill(0);
 if(!token||/[\r\n]/u.test(token))throw new Error('Invalid device token.');secrets.push(token);report.deviceTokenDecrypted=true;save();
 if(encodedPem||referenceVariant){report.tokenShape={type:'string',characters:token.length,dotSeparatedSegments:token.split('.').length,jwtShaped:/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)};report.completed=true;step='local-unwrap-complete';throw new Error('Requested stop after unwrap.');}
 const value=randomBytes(32).toString('base64url'),stored='.1'+value;secrets.push(value,stored);
 step='packet-add';
 const locator=(await request('POST','/packet/add',JSON.stringify({meta:{subject:'Opintel device probe',title:'Certificate authorization probe',labels:['opintel-probe']},type:'msg',recipients:recipient,expires:'24',key:stored}),token)).trim();
 if(!/^[A-Za-z0-9_-]{43}$/u.test(locator))throw new Error('Unexpected locator format.');secrets.push(locator);report.packetAccepted=true;
 step='key-retrieval';const fetched=await request('GET','/key/'+encodeURIComponent(locator),undefined,token);
 report.keyReturned=true;report.exactPrefixedMatch=fetched===stored;report.valueMatchWithoutPrefix=fetched===value;
 report.keyMatches=report.exactPrefixedMatch||report.valueMatchWithoutPrefix;
 if(!report.keyMatches)throw new Error('Retrieved key mismatch.');report.completed=true;
}catch{report.stoppedAt=step;}
finally{sdk.getCache().clearAllProfiles();save();process.stdout.write(JSON.stringify(report,null,2)+'\n');}
