import {randomBytes,sign,verify,createPublicKey,type KeyObject} from 'node:crypto';
import {releaseClaims,releaseHeader,type ReleaseClaims} from '../../../shared/release-contract.js';
import {sealCell} from '../../../shared/infrastructure/sealed-cell.js';
export {sealCell,unsealCell} from '../../../shared/infrastructure/sealed-cell.js';
export function xorShares(a:Uint8Array,b:Uint8Array):Buffer {if(a.length!==32||b.length!==32)throw new Error('Invalid release share length.');return Buffer.from(a.map((v,i)=>v^b[i]!));}
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
