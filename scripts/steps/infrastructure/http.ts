import {publicCode,publicCause,transportFailure} from './diagnostics.js';
import {z} from 'zod';
export class HttpFailure extends Error {constructor(readonly route:string,readonly status:number,readonly code:string,readonly cause:string|null){super(`${route}: HTTP ${status}, ${code}${cause?' / '+cause:''}`);}}
export async function apiRequest(base:URL,route:string,method:string,body?:unknown,cookie?:string,headers:Record<string,string>={}){
 let response:Response;try{response=await fetch(new URL(route,base),{method,headers:{origin:base.origin,'content-type':'application/json',...cookie?{cookie}:{},...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});}catch(error){throw new Error(`${method} ${route}: ${transportFailure(error)}`);}
 const text=await response.text();let value:unknown;try{value=text?JSON.parse(text):undefined;}catch{throw new HttpFailure(route,response.status,'invalid_response',null);}
 if(!response.ok){const parsed=z.object({error:z.object({code:z.string(),details:z.record(z.string(),z.unknown()).optional()})}).safeParse(value);throw new HttpFailure(route,response.status,publicCode(parsed.success?parsed.data.error.code:undefined),parsed.success&&parsed.data.error.details?.cause?publicCause(parsed.data.error.details.cause):null);}
 return {value,response};
}
export function gatewayOrigin(value:string){const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Gateway must be an HTTPS origin without credentials, path or query.');return url;}
