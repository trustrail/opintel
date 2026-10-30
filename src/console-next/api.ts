import {z} from 'zod';
import {createApiClient} from '../shared/api/client.js';
export type Client=ReturnType<typeof createApiClient>;
export async function read<T>(client:Client,path:string,response:z.ZodType<T>){const result=await client.request({path,response});if(!result.ok)throw result.error;return result.value;}
export async function pages<T>(client:Client,path:string,schema:z.ZodType<{items:T[];nextCursor:string|null}>,maxPages=100){
 const items:T[]=[],seen=new Set<string>();let cursor:string|null=null;
 for(let n=0;n<maxPages;n++){
  const page:{items:T[];nextCursor:string|null}=await read(client,path+(path.includes('?')?'&':'?')+(cursor?'cursor='+encodeURIComponent(cursor):''),schema);items.push(...page.items);cursor=page.nextCursor;
  if(!cursor)return {items,complete:true};
  if(seen.has(cursor))throw new Error('The list changed while loading. Refresh to read it again.');seen.add(cursor);
 }return {items,complete:false};
}
