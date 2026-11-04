import {mtlsFetch} from './mtls-fetch.js';
import {EnrollmentChallenge,type IdentityEnrollment} from '../../../src/shared/api/credential-identity.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import {transportFailure} from './diagnostics.js';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export type AgentIdentity={certificate:string;key:string|Buffer;enrollment:IdentityEnrollment;proveEnrollment?:(locator:string)=>Promise<Uint8Array>};
export function withEnrollmentProof(baseFetch:typeof fetch,identity:AgentIdentity|undefined):typeof fetch{
 return async(input,init)=>{
  const response=await baseFetch(input,init);
  if(response.status!==401||!identity?.proveEnrollment||typeof init?.body!=='string')return response;
  let message:unknown;try{message=JSON.parse(init.body);}catch{return response;}
  if(!isInitializeRequest(message))return response;
  const envelope=z.object({error:z.object({details:z.object({cause:z.literal('identity_unproven'),challenge:EnrollmentChallenge})})}).safeParse(await response.clone().json().catch(()=>null));
  if(!envelope.success)return response;
  const challenge=envelope.data.error.details.challenge;
  if(Date.parse(challenge.expiresAt)<=Date.now())throw new Error('Identity enrollment: XQ challenge expired; nothing was bound.');
  await response.body?.cancel();
  const nonce=await identity.proveEnrollment(challenge.locator);
  try{
   if(nonce.length!==32)throw new Error('Identity enrollment: invalid XQ challenge response; nothing was bound.');
   const retry={...message,params:{...message.params,_meta:{...message.params._meta,'opintel.identity':{...identity.enrollment,proof:{id:challenge.id,nonce:Buffer.from(nonce).toString('base64url')}}}}};
   // Exactly one proof submission, only during initialize. Query calls never replay.
   return await baseFetch(input,{...init,body:JSON.stringify(retry)});
  }finally{nonce.fill(0);}
 };
}
export async function mcpAgent(gateway:URL,project:string,key:string,agentId:string,identity?:AgentIdentity){
 const client=new Client({name:'opintel-steps',version:'1'}),url=new URL(`/mcp/v1/p/${project}`,gateway);url.searchParams.set('agentId',agentId);
 const baseFetch=identity?mtlsFetch(identity.certificate,identity.key):fetch;
 const enrollmentFetch=withEnrollmentProof(baseFetch,identity);
 const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:'Bearer '+key}},fetch:enrollmentFetch});
 if(identity){const send=transport.send.bind(transport);transport.send=(message,options)=>send(isInitializeRequest(message)?{...message,params:{...message.params,_meta:{...message.params._meta,'opintel.identity':identity.enrollment}}}:message,options);}
 try{await client.connect(transport);}catch(error){await client.close().catch(()=>{});throw new Error('MCP initialization: '+transportFailure(error));}
 return {client,call:async(name:string,args:Record<string,unknown>)=>z.object({isError:z.boolean().optional(),structuredContent:z.unknown().optional(),_meta:z.record(z.string(),z.unknown()).optional()}).passthrough().parse(await client.callTool({name,arguments:args})),close:()=>client.close()};
}
