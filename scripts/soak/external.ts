/** External-agent connections only. No database, server, seeder or observer imports. */
import {readFile,stat} from 'node:fs/promises';
import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {mcpAgent} from '../steps/infrastructure/mcp.js';
import {clientIdentity} from '../steps/infrastructure/identity.js';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {demoManifest,certificateMapping} from './manifest.js';
export async function externalTarget(target:string,file:string,identitiesFile?:string){
 const base=new URL(target);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('--target must be an HTTP(S) origin without credentials or a path');
 if(base.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Non-loopback targets require HTTPS');
 if((await stat(file)).mode&0o077)throw new Error('Demo credential manifest must have mode 600');
 const manifest=demoManifest.parse(JSON.parse(await readFile(file,'utf8')));
 if(manifest.version!==2||!manifest.specification)throw new Error('Run dev:demo --soak to emit the version 2 scenario specification first');
 if(manifest.agents.length!==10)throw new Error('Demo manifest is incomplete; finish dev:demo --soak first');
 const mapping=identitiesFile?certificateMapping.parse(JSON.parse(await readFile(identitiesFile,'utf8'))):[];
 const clients:Client[]=[];
 return {base,manifest,agents:manifest.agents,
  async connect(key:string,agentId:string){
   const credential=[...manifest.agents,...Object.values(manifest.lifecycle??{})].find(a=>a.key===key||('replacementKey'in a&&a.replacementKey===key));
   const entry=mapping.find(e=>e.certificateId===credential?.association?.certificateId);
   const directory=entry?.bundlePath.startsWith('~/')?join(homedir(),entry.bundlePath.slice(2)):entry?.bundlePath;
   const identity=directory?await clientIdentity(directory,credential?.association):undefined;
   const connection=await mcpAgent(base,manifest.projectId,key,agentId,identity);clients.push(connection.client);
   return {client:connection.client,query:(sql:string)=>connection.client.callTool({name:'opintel.query',arguments:{sql}})};
  },
  async close(){await Promise.allSettled(clients.map(c=>c.close()));},
 };
}
