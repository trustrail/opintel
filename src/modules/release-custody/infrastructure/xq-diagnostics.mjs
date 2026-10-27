import {Buffer} from 'node:buffer';

// Provider text is untrusted. Preserve diagnostic fields, never echoed packet
// material, arbitrary object fields, credentials, URLs or opaque identifiers.
const fields=new Set(['code','errorCode','error_code','error','errors','message','errorMessage','error_description','msg','reason','detail','details','description','title','type','status','retryAfter','retry_after','retryAfterSeconds','limit','remaining','resetAt','quota']);
export function xqRequestShape(payload,plain){
 if(plain)return {encoding:'text'};
 const length=value=>typeof value==='string'?value.length:null;
 return {encoding:'json',fieldCount:payload&&typeof payload==='object'?Object.keys(payload).length:0,keyCharacters:length(payload?.key),recipientCharacters:length(payload?.recipients),expiresHours:Number.isSafeInteger(payload?.expires)?payload.expires:null,singleUse:typeof payload?.dor==='boolean'?payload.dor:null,storageType:Number.isSafeInteger(payload?.type)?payload.type:null,receiptCharacters:length(payload?.meta?.receipt)};
}
export function redactedXqBody(text,secrets=[]){
 let truncated=false;
 const known=[...new Set(secrets.filter(value=>typeof value==='string'&&value.length>0))].sort((a,b)=>b.length-a.length);
 const clean=value=>{
  let safe=value;
  for(const secret of known)for(const representation of new Set([secret,encodeURIComponent(secret),JSON.stringify(secret).slice(1,-1)]))safe=safe.split(representation).join('[masked]');
  safe=safe.replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/gu,'[masked]')
   .replace(/https?:\/\/[^\s<>"']+/giu,'[masked]')
   .replace(/\bBearer\s+[^\s,;"']+/giu,'Bearer [masked]')
   .replace(/\b(?:[\w-]*(?:token|secret|password|authorization|cookie|key|share|packet|locator|recipient|alias)[\w-]*)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,'[masked]')
   .replace(/[A-Za-z0-9_+/.=-]{24,}/gu,'[masked]')
   .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/gu,'[masked]')
   .replace(/\p{Cc}/gu,' ');
  if(safe.length>512){truncated=true;safe=safe.slice(0,512);}
  return safe;
 };
 const visit=(value,depth=0)=>{
  if(depth>4){truncated=true;return '[truncated]';}
  if(typeof value==='string')return clean(value);
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(Array.isArray(value)){if(value.length>16)truncated=true;return value.slice(0,16).map(item=>visit(item,depth+1));}
  if(value&&typeof value==='object'){
   const entries=Object.entries(value);if(entries.length>16)truncated=true;
   return Object.fromEntries(entries.slice(0,16).map(([key,item],index)=>fields.has(key)?[key,visit(item,depth+1)]:['maskedField'+index,'[masked]']));
  }
  return '[masked]';
 };
 let parsed;try{parsed=JSON.parse(text);}catch{parsed=text;}
 const rendered=typeof parsed==='string'?clean(parsed):JSON.stringify(visit(parsed));
 const bytes=Buffer.from(rendered);if(bytes.length>2048)truncated=true;
 return {text:bytes.subarray(0,2048).toString('utf8').replace(/\uFFFD$/u,''),truncated};
}
