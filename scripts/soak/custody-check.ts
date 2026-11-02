/** Agent-side only. Neither reconstructed key nor decrypted values are returned. */
import {isDeepStrictEqual} from 'node:util';
import {unsealColumns} from '../steps/infrastructure/unseal.js';
export function verifyCustodyCells(output:{columns:Array<{name:string}>;rows:unknown[][];evidenceId:string},columns:string[],expected:Record<string,unknown[]>,first:Uint8Array,second:Uint8Array):{matches:boolean;verified:number}{
 try{
  const rows=unsealColumns(output,columns,first,second);let verified=0;
  for(const name of columns){const index=output.columns.findIndex(c=>c.name===name);if(!Array.isArray(expected[name])||!isDeepStrictEqual(rows.map(row=>row[index]),expected[name]))return {matches:false,verified:0};verified+=rows.length;}
  return {matches:true,verified};
 }catch{return {matches:false,verified:0};}
}
