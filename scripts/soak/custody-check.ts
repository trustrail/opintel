/** Agent-side only. Neither reconstructed key nor decrypted values are returned. */
import {isDeepStrictEqual} from 'node:util';
import {unsealCell} from '../../src/shared/infrastructure/sealed-cell.js';
import {xorShares} from '../../src/shared/infrastructure/sealed-result.js';
export function verifyCustodyCells(output:{columns:Array<{name:string}>;rows:unknown[][];evidenceId:string},columns:string[],expected:Record<string,unknown[]>,first:Uint8Array,second:Uint8Array):{matches:boolean;verified:number}{
 let key:Buffer|undefined;let verified=0;
 try{
  key=xorShares(first,second);const combined=key;
  for(const name of columns){const index=output.columns.findIndex(c=>c.name===name);if(index<0||!Array.isArray(expected[name]))return {matches:false,verified:0};
   const values=output.rows.map((row,i)=>{const value=row[index];if(typeof value!=='string')throw new Error('Unsealed custody value');return unsealCell(value,combined,output.evidenceId,name,i);});
   if(!isDeepStrictEqual(values,expected[name]))return {matches:false,verified:0};verified+=values.length;
  }return {matches:true,verified};
 }catch{return {matches:false,verified:0};}finally{key?.fill(0);}
}
