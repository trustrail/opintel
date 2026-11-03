import {transportFailure} from './diagnostics.js';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export async function mcpAgent(gateway:URL,project:string,key:string,agentId:string){
 const client=new Client({name:'opintel-steps',version:'1'}),url=new URL(`/mcp/v1/p/${project}`,gateway);url.searchParams.set('agentId',agentId);
 try{await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:'Bearer '+key}}}));}catch(error){await client.close().catch(()=>{});throw new Error('MCP initialization: '+transportFailure(error));}
 return {call:async(name:string,args:Record<string,unknown>)=>z.object({isError:z.boolean().optional(),structuredContent:z.unknown().optional(),_meta:z.record(z.string(),z.unknown()).optional()}).passthrough().parse(await client.callTool({name,arguments:args})),close:()=>client.close()};
}
