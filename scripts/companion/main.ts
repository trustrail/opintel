// Initialize Zod before SDK schemas in the bundled ESM entrypoint.
import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {wipePrivateDirectory} from '../infrastructure/private-cleanup.mjs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Config,Credential,createTools} from './core.js';
import {transportFailure} from '../steps/infrastructure/diagnostics.js';
import {ShareRefused,deviceAgent} from '../steps/infrastructure/device.js';
import {enrollmentIdentity} from '../steps/infrastructure/identity.js';
import {mcpAgent} from '../steps/infrastructure/mcp.js';

let cleanup=async()=>{};
let startupStage='configuration';
let stopping=false;
const shutdown=()=>{if(stopping)return;stopping=true;void cleanup().then(()=>process.exit(0),()=>{console.error('Companion private-file cleanup failed.');process.exit(1);});};
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
async function main(){
 const probe=process.env.AP_PROBE_MODE==='1',port=Number(process.env.MCP_PORT);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid MCP_PORT.');
 let makeInvoke:()=>((name:string,args:Record<string,unknown>)=>Promise<unknown>)=()=>async()=>({refused:true,code:'probe_mode'});
 let close=async()=>{};let root='';
 if(!probe){
  const credential=Credential.parse(JSON.parse(process.env.OPINTEL_AGENT_CREDENTIAL??''));delete process.env.OPINTEL_AGENT_CREDENTIAL;
  const config=Config.parse(JSON.parse(process.env.AP_SIDECAR_CONFIG??''));
  startupStage='private identity files';
  root=join('/run/opintel',randomUUID());const identityDir=join(root,'identity-bundles',credential.identity.name);
  cleanup=async()=>{wipePrivateDirectory(root);};
  mkdirSync(identityDir,{recursive:true,mode:0o700});
  for(const [name,value] of Object.entries({'client.crt':credential.identity.clientCert,'client.key':credential.identity.clientKey,'transport.key':credential.identity.transportKey}))writeFileSync(join(identityDir,name),value,{mode:0o600,flag:'wx'});
  writeFileSync(join(root,'active-identity'),credential.identity.name+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(join(root,'pool-key'),credential.poolKey,{mode:0o600,flag:'wx'});
  writeFileSync(join(root,'xq-api-key'),credential.xqApiKey,{mode:0o600,flag:'wx'});
  process.env.TMPDIR=root;
  const device=deviceAgent(),certificateId=Number(credential.identity.name.slice('device-'.length));
  cleanup=async()=>{await device.close();wipePrivateDirectory(root);};
  startupStage='XQ identity exchange';
  const association=await device.exchange(certificateId,credential.identity.name,identityDir,credential.xqApiKey);
  startupStage='TLS identity';
  const identity=await enrollmentIdentity(identityDir,join(root,'xq-api-key'),association);
  startupStage='gateway MCP initialization';
  const upstream=await mcpAgent(new URL(config.gateway),config.project,credential.poolKey,config.agentId,identity);
  makeInvoke=()=>createTools(upstream.call,config,locator=>device.share(certificateId,locator));
  close=async()=>{try{await device.close();}finally{wipePrivateDirectory(root);}await upstream.close();};cleanup=close;
 }
 const transports=new Map<string,StreamableHTTPServerTransport>();
 const server=createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200).end('ok');return;}
  if(req.url!=='/mcp'){res.writeHead(404).end();return;}
  try{
   const session=req.headers['mcp-session-id'];let transport=typeof session==='string'?transports.get(session):undefined;
   if(!transport&&req.method==='POST'&&!session){
    const invoke=makeInvoke();
    const mcp=new McpServer({name:'opintel-companion',version:'1.0.0'});
    const register=(name:string,inputSchema:z.ZodRawShape)=>mcp.registerTool(name,{inputSchema},async(args)=>{
     try{const result=await invoke(name,args as Record<string,unknown>);const item=result&&typeof result==='object'?result as Record<string,unknown>:{};const outcome=item.refused===true?'refused '+String(item.code??'unknown'):'ok';const evidence=z.uuid().safeParse(item.evidenceId).success?String(item.evidenceId):'-';const rows=Array.isArray(item.rows)?item.rows.length:0;console.info(`${name} ${outcome} ${evidence} ${rows}`);return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:item};}catch{console.info(`${name} refused internal_error - 0`);return {content:[{type:'text' as const,text:JSON.stringify({refused:true,code:'internal_error'})}],structuredContent:{refused:true,code:'internal_error'}};}
    });
    register('opintel_describe',{});register('opintel_query',{sql:z.string()});register('opintel_unseal',{evidenceId:z.string().optional(),grantId:z.string().optional()});
    transport=new StreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID(),onsessioninitialized:id=>{transports.set(id,transport!);}});transport.onclose=()=>{if(transport?.sessionId)transports.delete(transport.sessionId);};await mcp.connect(transport);
   }
   if(!transport){res.writeHead(400).end();return;}await transport.handleRequest(req,res);
  }catch{if(!res.headersSent)res.writeHead(500).end();}
 });
 cleanup=async()=>{const closing=close();server.close();try{await Promise.all([...transports.values()].map(t=>t.close()));}finally{await closing;}};
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
}
void main().catch(async(error:unknown)=>{if(stopping)return;await cleanup();const reason=error instanceof ShareRefused?error.message:transportFailure(error);console.error(`Companion could not start at ${startupStage}: ${reason}`);process.exitCode=1;});
