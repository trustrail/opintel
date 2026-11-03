import {unsealCell} from '../../../src/shared/infrastructure/sealed-cell.js';
import {xorShares} from '../../../src/shared/infrastructure/sealed-result.js';
/** Agent-side only; validate every cell before releasing any plaintext rows. */
export function unsealColumns(output:{columns:Array<{name:string}>;rows:unknown[][];evidenceId:string},columns:readonly string[],first:Uint8Array,second:Uint8Array){
 let key:Buffer|undefined;
 try{
  key=xorShares(first,second);const combined=key,rows=output.rows.map(row=>[...row]);
  for(const name of columns){const index=output.columns.findIndex(c=>c.name===name);if(index<0)throw new Error('Custody column is absent from the result.');
   for(const [ordinal,row] of rows.entries()){const value=row[index];if(typeof value!=='string')throw new Error('Custody cell is not sealed.');row[index]=unsealCell(value,combined,output.evidenceId,name,ordinal);}
  }return rows;
 }finally{key?.fill(0);}
}
