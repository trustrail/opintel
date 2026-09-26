import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { bulkFixture } from './fixtures/bulk-entitlements/fixture.js';
import { PoolKeyCreationResponse } from '../src/shared/api/pool-keys.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { PoolId, type Result } from '../src/shared/kernel/index.js';
import { PoolKeyService, PostgresPoolKeys, PostgresKeyVerifier, AgentPresenceService, PostgresAgentPresence } from '../src/modules/pools/index.js';
import { McpAccess, McpHttpServer, PostgresMcpConfiguration } from '../src/modules/mcp/index.js';
import { createHttpServer } from '../src/platform/http/index.js';
function unwrap<T>(r:Result<T>):T{if(!r.ok)throw new Error(r.error.message);return r.value;}
const cleanups:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close();});
async function fixture(){
 const f=await bulkFixture(0);
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 const events={publish:vi.fn(async()=>{})},presence=new PostgresAgentPresence(events),service=new AgentPresenceService(presence);
 const keys=new PoolKeyService(new PostgresPoolKeys(),presence);
 const created=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'create',name:'MCP pool'},randomUUID())));if(!created.keyShown)throw new Error('No key');
 const pool=PoolId(created.poolId),key=created.key;
 const mcp=new McpHttpServer(new McpAccess(new PostgresKeyVerifier(),service),new PostgresMcpConfiguration());
 const server=createHttpServer([],{agentInterface:mcp,requestIdFactory:()=> 'fixed-request'});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 cleanups.push(async()=>{await mcp.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const url=new URL(`http://127.0.0.1:${address.port}/mcp/v1/p/${f.ctx.projectId}`);
 const headers={authorization:`Bearer ${key}`,'x-opintel-agent-id':'agent-1'};
 const connect=async()=>{
  let opened!:()=>void;const streamOpened=new Promise<void>(resolve=>{opened=resolve;});
  const client=new Client({name:'contract-agent',version:'1'}),transport=new StreamableHTTPClientTransport(url,{requestInit:{headers},fetch:async(input,init)=>{const response=await fetch(input,init);if(init?.method==='GET'&&response.status===200)opened();return response;}});
  cleanups.push(()=>client.close());await client.connect(transport);return {client,transport,streamOpened};
 };
 const post=async(body:unknown,session?:string,override:Record<string,string>=headers,target=url)=>{
  const response=await fetch(target,{method:'POST',headers:{...override,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25',...(session?{'mcp-session-id':session}:{})},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json() as unknown};
 };
 const modes=(query:boolean,prompt:boolean)=>withTenant(f.ctx,tx=>tx.query('UPDATE pool SET mode_query=$2,mode_prompt=$3 WHERE id=$1',[pool,query,prompt]));
 return {...f,pool,keys,created,presence,service,events,mcp,url,headers,connect,post,modes,key};
}
describe('5.5 MCP Streamable HTTP',{timeout:30_000},()=>{
 it('I-004 / I-023: an SDK client initializes, lists schemas and gets unavailable results; presence uses the authenticated key',async()=>{
  const f=await fixture(),{client}=await f.connect();
  const result=await client.listTools();
  expect(result.tools.map(t=>t.name)).toEqual(['opintel.describe','opintel.explain','opintel.query']);
  for(const tool of result.tools){expect(tool.inputSchema.type).toBe('object');expect(tool.outputSchema?.type).toBe('object');}
  for(const [name,args] of [['opintel.describe',{}],['opintel.explain',{sql:'SELECT 1'}],['opintel.query',{sql:'SELECT 1',maxRows:3}]] as const){
   expect(await client.callTool({name,arguments:args})).toMatchObject({isError:true,_meta:{code:'dependency_unavailable'},content:[{type:'text',text:'This tool is not available in this deployment yet.'}]});
  }
  expect(await client.callTool({name:'opintel.query',arguments:{sql:123}})).toMatchObject({isError:true,_meta:{code:'validation_failed'}});
  const agents=unwrap(await f.service.list(f.ctx,f.pool,null,10));expect(agents).toHaveLength(1);
  expect(agents[0]).toMatchObject({agentId:'agent-1',verified:false,keyVersion:f.created.keyVersion,state:'active'});
  expect(f.events.publish).toHaveBeenCalled();
 });
 it('I-013: query gating applies to listing and calling; prompt tools are absent in Slice 1a',async()=>{
  const f=await fixture();await f.modes(false,true);const {client,transport}=await f.connect();
  expect((await client.listTools()).tools.map(t=>t.name)).toEqual(['opintel.describe','opintel.explain']);
  const call=(name:string)=>f.post({jsonrpc:'2.0',id:20,method:'tools/call',params:{name,arguments:{sql:'SELECT 1'}}},transport.sessionId);
  const unknown=await call('does.not.exist');
  for(const name of ['opintel.query','opintel.ask','opintel.respond_clarification'])expect(await call(name)).toEqual(unknown);
  await f.modes(true,false);expect((await client.listTools()).tools.map(t=>t.name)).toEqual(['opintel.describe','opintel.explain','opintel.query']);
  expect(await call('opintel.ask')).toEqual(unknown);
 });
 it('I-014: committed mode changes notify connected clients without a request; the next call sees the current mode',async()=>{
  const f=await fixture(),{client,streamOpened}=await f.connect();
  await client.listTools();
  let received!:()=>void;const notification=new Promise<void>(resolve=>{received=resolve;});
  client.setNotificationHandler(ToolListChangedNotificationSchema,()=>{received();});
  await streamOpened;
  await f.modes(false,false);await f.mcp.refresh();await notification;
  expect((await client.listTools()).tools.map(t=>t.name)).toEqual(['opintel.describe','opintel.explain']);
  await expect(client.callTool({name:'opintel.query',arguments:{sql:'SELECT 1'}})).rejects.toThrow('Unknown tool.');
 });
 it('I-005/I-006: malformed, unknown, revoked and wrong-project keys have the identical envelope, even on an existing session',async()=>{
  const f=await fixture(),{transport}=await f.connect();
  const body={jsonrpc:'2.0',id:3,method:'tools/list'};
  const malformed=await f.post(body,transport.sessionId,{...f.headers,authorization:'Bearer malformed'});
  expect(malformed).toEqual({status:401,body:{error:{code:'unauthenticated',message:'The pool key is not valid.',requestId:'fixed-request',retryable:false}}});
  expect(await f.post(body,transport.sessionId,{...f.headers,authorization:`Bearer opk_live_${'A'.repeat(22)}`})).toEqual(malformed);
  expect(await f.post(body,transport.sessionId,f.headers,new URL(f.url.toString().replace(f.ctx.projectId,randomUUID())))).toEqual(malformed);
  await withTenant(f.ctx,tx=>tx.query("UPDATE pool_key SET state='revoked',grace_until=NULL WHERE id=$1",[f.created.keyVersion]));
  expect(await f.post(body,transport.sessionId)).toEqual(malformed);
 });
 it('requires the claimed id on every request and never uses it to authorize; ping only updates liveness',async()=>{
  const f=await fixture(),{client,transport}=await f.connect();
  const body={jsonrpc:'2.0',id:4,method:'tools/list'};
  expect(await f.post(body,transport.sessionId,{authorization:f.headers.authorization})).toMatchObject({status:400,body:{error:{message:'Supply the X-Opintel-Agent-Id header.'}}});
  expect(await f.post(body,transport.sessionId,{...f.headers,'x-opintel-agent-id':'claimed-someone-else'})).toEqual(await f.post(body,transport.sessionId));
  const before=unwrap(await f.service.list(f.ctx,f.pool,null,10)).find(a=>a.agentId==='agent-1')!;
  await client.ping();
  const after=unwrap(await f.service.list(f.ctx,f.pool,null,10)).find(a=>a.agentId==='agent-1')!;
  expect(after.lastRequestAt).toBe(before.lastRequestAt);expect(after.verified).toBe(false);
 });
 it('a session cannot cross pools; rotation can reuse it with the new key, and every HTTP method requires the agent header',async()=>{
  const f=await fixture(),{transport}=await f.connect();
  const other=PoolKeyCreationResponse.parse(unwrap(await f.keys.execute(f.ctx,{kind:'create',name:'Another MCP pool'},randomUUID())));if(!other.keyShown)throw new Error('No key');
  const body={jsonrpc:'2.0',id:7,method:'tools/list'};
  expect(await f.post(body,transport.sessionId,{...f.headers,authorization:`Bearer ${other.key}`})).toMatchObject({status:404});
  const rotated=PoolKeyCreationResponse.parse(unwrap(await f.keys.execute(f.ctx,{kind:'rotate',poolId:f.pool},randomUUID())));if(!rotated.keyShown)throw new Error('No key');
  expect(await f.post(body,transport.sessionId,{...f.headers,authorization:`Bearer ${rotated.key}`})).toEqual(await f.post(body,transport.sessionId));
  await f.post(body,transport.sessionId,{...f.headers,authorization:`Bearer ${rotated.key}`});
  expect(unwrap(await f.service.list(f.ctx,f.pool,null,10))[0]?.keyVersion).toBe(rotated.keyVersion);
  for(const method of ['GET','DELETE']){
   const response=await fetch(f.url,{method,headers:{authorization:`Bearer ${rotated.key}`,accept:'text/event-stream','mcp-session-id':transport.sessionId!}});
   expect(response.status).toBe(400);expect(await response.json()).toMatchObject({error:{message:'Supply the X-Opintel-Agent-Id header.'}});
  }
  const ended=await fetch(f.url,{method:'DELETE',headers:{...f.headers,'mcp-session-id':transport.sessionId!,'mcp-protocol-version':'2025-11-25'}});
  expect(ended.status).toBe(200);await ended.text();
  expect(await f.post(body,transport.sessionId)).toMatchObject({status:404});
 });
});
