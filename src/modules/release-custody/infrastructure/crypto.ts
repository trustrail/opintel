import {createCipheriv,createDecipheriv,randomBytes,sign,verify,createPublicKey,type KeyObject} from 'node:crypto';
import {releaseClaims,releaseHeader,sealedPrefix,type ReleaseClaims} from '../../../shared/release-contract.js';
/** Length-prefixed UTF-8 fields prevent ambiguous concatenation; row ordinals are zero based. */
function aad(receipt:string,column:string,row:number):Buffer {
 if(!Number.isSafeInteger(row)||row<0)throw new Error('Invalid custody row ordinal.');
 return Buffer.concat([receipt,column,String(row)].map(field=>{const bytes=Buffer.from(field),length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);return Buffer.concat([length,bytes]);}));
}
export function xorShares(a:Uint8Array,b:Uint8Array):Buffer {if(a.length!==32||b.length!==32)throw new Error('Invalid release share length.');return Buffer.from(a.map((v,i)=>v^b[i]!));}
export function sealCell(value:unknown,key:Uint8Array,receipt:string,column:string,row:number,nonce:Uint8Array):string {
 if(key.length!==32||nonce.length!==12)throw new Error('Invalid custody key or nonce length.');
 const plain=Buffer.from(JSON.stringify(value));
 try{const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad(receipt,column,row));return sealedPrefix+Buffer.concat([nonce,cipher.update(plain),cipher.final(),cipher.getAuthTag()]).toString('base64url');}finally{plain.fill(0);}
}
export function unsealCell(value:string,key:Uint8Array,receipt:string,column:string,row:number):unknown {
 if(!value.startsWith(sealedPrefix)||key.length!==32)throw new Error('Invalid sealed value.');
 const encoded=value.slice(sealedPrefix.length);if(!/^[A-Za-z0-9_-]+$/u.test(encoded))throw new Error('Invalid sealed value.');
 const bytes=Buffer.from(encoded,'base64url');if(bytes.length<28||bytes.toString('base64url')!==encoded)throw new Error('Invalid sealed value.');
 const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAAD(aad(receipt,column,row));cipher.setAuthTag(bytes.subarray(-16));
 const plain=Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]);try{return JSON.parse(plain.toString('utf8')) as unknown;}finally{plain.fill(0);}
}
export function sealResult(rows:readonly (readonly unknown[])[],columns:readonly string[],indices:readonly number[],receipt:string,observe?:(key:Buffer,first:Buffer,second:Buffer)=>void){
 if(new Set(columns).size!==columns.length||indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=columns.length)||rows.some(row=>row.length!==columns.length))throw new Error('Ambiguous custody result columns.');
 const key=randomBytes(32),first=randomBytes(32),second=xorShares(key,first),seed=randomBytes(4);
 try{observe?.(key,first,second);return {rows:rows.map((row,r)=>row.map((value,c)=>{if(!indices.includes(c))return value;const nonce=Buffer.alloc(12);seed.copy(nonce);nonce.writeBigUInt64BE(BigInt(r)*BigInt(columns.length)+BigInt(c),4);return sealCell(value,key,receipt,columns[c]!,r,nonce);})),first,second};}
 catch(error){first.fill(0);second.fill(0);throw error;}finally{key.fill(0);seed.fill(0);}
}
export function signGrant(claims:ReleaseClaims,kid:string,key:KeyObject):string {const header=Buffer.from(JSON.stringify(releaseHeader.parse({alg:'EdDSA',kid,typ:'JWT'}))).toString('base64url'),payload=Buffer.from(JSON.stringify(releaseClaims.parse(claims))).toString('base64url');const input=header+'.'+payload;return input+'.'+sign(null,Buffer.from(input),key).toString('base64url');}
export function verifyGrant(grant:string,key:(kid:string)=>KeyObject|undefined):ReleaseClaims {
 const parts=grant.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/u.test(p)))throw new Error('Invalid release grant.');
 const [header,payload,signature]=parts as [string,string,string];const h=releaseHeader.parse(JSON.parse(Buffer.from(header,'base64url').toString('utf8')) as unknown),publicKey=key(h.kid);
 if(!publicKey||!verify(null,Buffer.from(header+'.'+payload),createPublicKey(publicKey.type==='private'?publicKey:publicKey.export({format:'pem',type:'spki'})),Buffer.from(signature,'base64url')))throw new Error('Invalid release grant signature.');
 return releaseClaims.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as unknown);
}
