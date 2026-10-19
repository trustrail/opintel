/** External-agent connections only. No database, server, seeder or observer imports. */
import {readFile,stat} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {demoManifest} from './manifest.js';
export async function externalTarget(target:string,file:string){
 const base=new URL(target);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('--target must be an HTTP(S) origin without credentials or a path');
 if(base.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Non-loopback targets require HTTPS');
 if((await stat(file)).mode&0o077)throw new Error('Demo credential manifest must have mode 600');
 const manifest=demoManifest.parse(JSON.parse(await readFile(file,'utf8')));
 if(manifest.version!==2||!manifest.specification)throw new Error('Run dev:demo --soak to emit the version 2 scenario specification first');
 if(manifest.agents.length!==10)throw new Error('Demo manifest is incomplete; finish dev:demo --soak first');
 const clients:Client[]=[];
 return {base,manifest,agents:manifest.agents,
  async connect(key:string,agentId:string){const client=new Client({name:'reinsurance-soak',version:'1'});clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL(`/mcp/v1/p/${manifest.projectId}`,base),{requestInit:{headers:{authorization:'Bearer '+key,'x-opintel-agent-id':agentId}}}));return {client,query:(sql:string)=>client.callTool({name:'opintel.query',arguments:{sql}})};},
  async close(){await Promise.allSettled(clients.map(c=>c.close()));},
 };
}
