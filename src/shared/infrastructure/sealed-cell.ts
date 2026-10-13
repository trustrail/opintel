import {createCipheriv,createDecipheriv} from 'node:crypto';
import {sealedPrefix} from '../release-contract.js';
/** Length-prefixed UTF-8 fields prevent ambiguous concatenation; row ordinals are zero based. */
function aad(receipt:string,column:string,row:number):Buffer {
 if(!Number.isSafeInteger(row)||row<0)throw new Error('Invalid custody row ordinal.');
 return Buffer.concat([receipt,column,String(row)].map(field=>{const bytes=Buffer.from(field),length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);return Buffer.concat([length,bytes]);}));
}
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
