import {randomBytes} from 'node:crypto';
import {sealCell} from './sealed-cell.js';
export function xorShares(a:Uint8Array,b:Uint8Array):Buffer {if(a.length!==32||b.length!==32)throw new Error('Invalid release share length.');return Buffer.from(a.map((v,i)=>v^b[i]!));}
/** Engine-owned result lifetime. Preview destroys shares without releasing them. */
export function resultSealer(columns:readonly string[],indices:readonly number[],receipt:string,observe?:(key:Buffer,first:Buffer,second:Buffer)=>void){
 if(new Set(columns).size!==columns.length||indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=columns.length))throw new Error('Ambiguous custody result columns.');
 const key=randomBytes(32),first=randomBytes(32),second=xorShares(key,first),seed=randomBytes(4);
 const close=()=>{key.fill(0);first.fill(0);second.fill(0);seed.fill(0);};
 try{observe?.(key,first,second);}catch(error){close();throw error;}
 return {seal(row:readonly unknown[],ordinal:number){
  if(row.length!==columns.length)throw new Error('Ambiguous custody result columns.');
  return row.map((value,c)=>{if(!indices.includes(c))return value;const nonce=Buffer.alloc(12);seed.copy(nonce);nonce.writeBigUInt64BE(BigInt(ordinal)*BigInt(columns.length)+BigInt(c),4);return sealCell(value,key,receipt,columns[c]!,ordinal,nonce);});
 },shares:()=>({first:Buffer.from(first),second:Buffer.from(second)}),close};
}
export function sealResult(rows:readonly (readonly unknown[])[],columns:readonly string[],indices:readonly number[],receipt:string,observe?:(key:Buffer,first:Buffer,second:Buffer)=>void){
 const sealer=resultSealer(columns,indices,receipt,observe);
 try{return {rows:rows.map((row,i)=>sealer.seal(row,i)),...sealer.shares()};}finally{sealer.close();}
}
