import {mtlsFetch} from './mtls-fetch.js';
import type {IdentityEnrollment} from '../../../src/shared/api/credential-identity.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import {transportFailure} from './diagnostics.js';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export async function mcpAgent(gateway:URL,project:string,key:string,agentId:string,identity?:{certificate:string;key:string|Buffer;enrollment:IdentityEnrollment}){
 const client=new Client({name:'opintel-steps',version:'1'}),url=new URL(`/mcp/v1/p/${project}`,gateway);url.searchParams.set('agentId',agentId);
 const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:'Bearer '+key}},...identity?{fetch:mtlsFetch(identity.certificate,identity.key)}:{}});
 if(identity){const send=transport.send.bind(transport);transport.send=(message,options)=>send(isInitializeRequest(message)?{...message,params:{...message.params,_meta:{...message.params._meta,'opintel.identity':identity.enrollment}}}:message,options);}
 try{await client.connect(transport);}catch(error){await client.close().catch(()=>{});throw new Error('MCP initialization: '+transportFailure(error));}
 return {client,call:async(name:string,args:Record<string,unknown>)=>z.object({isError:z.boolean().optional(),structuredContent:z.unknown().optional(),_meta:z.record(z.string(),z.unknown()).optional()}).passthrough().parse(await client.callTool({name,arguments:args})),close:()=>client.close()};
}
