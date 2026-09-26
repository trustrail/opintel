import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { bulkFixture } from './fixtures/bulk-entitlements/fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { PoolId, SystemClock, type Result } from '../src/shared/kernel/index.js';
import { PoolKeyCreationResponse } from '../src/shared/api/pool-keys.js';
import { DescribeOutput } from '../src/shared/api/mcp.js';
import { PoolKeyService, PostgresPoolKeys, PostgresKeyVerifier, AgentPresenceService, PostgresAgentPresence, PoolBindingService, PostgresPoolBindings } from '../src/modules/pools/index.js';
import { RelationshipOutbox } from '../src/modules/tenancy/index.js';
import { SpiceDbAuthorizationPort } from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import { McpAccess, McpHttpServer, PostgresMcpConfiguration, DescribeService, PostgresDescribeReader } from '../src/modules/mcp/index.js';
import { createHttpServer } from '../src/platform/http/index.js';
function unwrap<T>(r:Result<T>):T{if(!r.ok)throw new Error(r.error.message);return r.value;}
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(){
 const f=await bulkFixture(6),clock=new SystemClock();
 const authorization=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock,stalenessCeilingMs:10000});cleanup.push(async()=>{authorization.close();});
 await authorization.loadSchema(await readFile('docs/opintel-schema.zed','utf8'));
 await authorization.write([{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}}]);
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 const presence=new PostgresAgentPresence({publish:async()=>{}}),keys=new PoolKeyService(new PostgresPoolKeys(),presence);
 const issued=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'create',name:'Describe pool'},randomUUID())));if(!issued.keyShown)throw new Error('No key');
 const pool=PoolId(issued.poolId),outbox=new RelationshipOutbox(),bindings=new PoolBindingService(new PostgresPoolBindings(outbox),outbox,authorization);
 unwrap(await bindings.set(f.ctx,pool,f.source,true));
 await withTenant(f.ctx,async tx=>{
  await tx.query("UPDATE catalog_object SET object_name='Original Records' WHERE source_id=$1",[f.source]);
  for(let i=0;i<f.ids.length;i++){
   await tx.query('UPDATE catalog_element SET source_identifier=$2,ordinal=$3,exposed_type=$4,source_type=$5 WHERE id=$1',[f.ids[i],`Original Field ${i+1}`,i,['INTEGER','BIGINT','VARCHAR','DECIMAL(12,2)','VARCHAR','VARCHAR'][i],['int4','int8','text','numeric(12,2)','text','text'][i]]);
  }
  for(const [i,treatment] of ['clear','tokenized','masked','aggregate_only','withheld'].entries()){
   await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref,mask_kind) VALUES($1,$2,$3,$4,'user',$5,CASE WHEN $4='masked' THEN 'last4' ELSE NULL END)",[pool,f.ids[i],f.ctx.projectId,treatment,f.ctx.userId]);
  }
 });
 const reader=new PostgresDescribeReader(),service=new DescribeService(reader,authorization);
 const mcp=new McpHttpServer(new McpAccess(new PostgresKeyVerifier(),new AgentPresenceService(presence)),new PostgresMcpConfiguration(),service);
 const server=createHttpServer([],{agentInterface:mcp});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 cleanup.push(async()=>{await mcp.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const client=new Client({name:'describe-test',version:'1'});cleanup.push(()=>client.close());
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp/v1/p/${f.ctx.projectId}`),{requestInit:{headers:{authorization:`Bearer ${issued.key}`,'x-opintel-agent-id':'unverified-agent'}}}));
 const call=async(args:Record<string,unknown>={})=>client.callTool({name:'opintel.describe',arguments:args});
 const describe=async(args:Record<string,unknown>={})=>{const response=await call(args);expect(response.isError).not.toBe(true);return DescribeOutput.parse(response.structuredContent);};
 return {...f,otherPool:f.pool,pool,bindings,authorization,reader,client,call,describe};
}
describe('5.6 agent describe',{timeout:30_000},()=>{
 it('I-007/I-008: exposed names, all post-treatment types, withheld named only, and no undecided metadata in any content',async()=>{
  const f=await fixture(),result=await f.call();
  const expected={objects:[{name:'warehouse.public.records',columns:[
   {name:'field_1',type:'INTEGER',treatment:'clear'},
   {name:'field_2',type:'VARCHAR',treatment:'tokenized'},
   {name:'field_3',type:'VARCHAR',treatment:'masked'},
   {name:'field_4',type:'DECIMAL(12,2)',treatment:'aggregate_only'},
  ],withheld:['field_5']}]};
  expect(result.structuredContent).toEqual(expected);
  expect(result.content).toEqual([{type:'text',text:JSON.stringify(expected)}]);
  for(const absent of ['field_6','Original','sourceIdentifier','undecided','_opintel_','BIGINT'])expect(JSON.stringify(result)).not.toContain(absent);
  await withTenant(f.ctx,tx=>tx.query('UPDATE pool SET mode_query=false,mode_prompt=false WHERE id=$1',[f.pool]));
  expect(await f.describe()).toEqual(expected);
  expect(await f.describe({object:'warehouse.public.records'})).toEqual(expected);
  expect(await f.describe({object:'warehouse.public.Original Records'})).toEqual({objects:[]});
  expect(await f.describe({object:"' OR true --"})).toEqual({objects:[]});
 });
 it('withheld-only and mixed objects retain withheld names; wholly undecided objects are absent even when explicitly requested',async()=>{
  const f=await fixture();
  await withTenant(f.ctx,async tx=>{
   for(const name of ['all_withheld','mixed','all_undecided']){
    const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public',$3,'table','public',$3) RETURNING id",[f.ctx.projectId,f.source,name]);
    for(let ordinal=0;ordinal<2;ordinal++){
     const [element]=await tx.query<{id:string}>("INSERT INTO catalog_element(project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal) VALUES($1,$2,$3,'text',$3,'VARCHAR',$4) RETURNING id",[f.ctx.projectId,object!.id,ordinal===0?'decided':'never_decided',ordinal]);
     if(name==='all_withheld'||name==='mixed'&&ordinal===0)await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'withheld','user',$4)",[f.pool,element!.id,f.ctx.projectId,f.ctx.userId]);
    }
   }
  });
  expect(await f.describe({object:'warehouse.public.all_withheld'})).toEqual({objects:[{name:'warehouse.public.all_withheld',columns:[],withheld:['decided','never_decided']}]});
  expect(await f.describe({object:'warehouse.public.mixed'})).toEqual({objects:[{name:'warehouse.public.mixed',columns:[],withheld:['decided']}]});
  expect(await f.describe({object:'warehouse.public.all_undecided'})).toEqual({objects:[]});
  const output=await f.describe();expect(output.objects.map(o=>o.name)).toEqual(['warehouse.public.all_withheld','warehouse.public.mixed','warehouse.public.records']);
 });
 it('both current source binding checks run on every call; another pool’s entitlement is not a decision for this pool',async()=>{
  const f=await fixture(),checks=vi.spyOn(f.authorization,'checkMany');
  await withTenant(f.ctx,tx=>tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[f.otherPool,f.ids[5],f.ctx.projectId,f.ctx.userId]));
  const otherProject=await bulkFixture(0);
  expect(unwrap(await f.reader.read(otherProject.ctx,f.pool))).toEqual([]);
  expect((await f.describe()).objects[0]?.columns).toHaveLength(4);
  await f.describe();expect(checks).toHaveBeenCalledTimes(2);
  expect(checks.mock.calls[0]?.[0]).toEqual([{resource:{type:'datasource',id:f.source},permission:'reachable',subject:{type:'pool',id:f.pool}}]);
  await f.authorization.write([{operation:'delete',resource:{type:'datasource',id:f.source},relation:'bound_pool',subject:{type:'pool',id:f.pool}}]);
  expect(await f.describe()).toEqual({objects:[]});
  unwrap(await f.bindings.set(f.ctx,f.pool,f.source,true));
  await withTenant(f.ctx,tx=>tx.query('DELETE FROM pool_source_binding WHERE pool_id=$1 AND source_id=$2',[f.pool,f.source]));
  expect(await f.describe()).toEqual({objects:[]});
 });
 it('removed objects/elements, archived sources and unsupported or unnameable elements are absent; failures disclose no catalogue diagnostics',async()=>{
  const f=await fixture();
  await withTenant(f.ctx,async tx=>{
   await tx.query("UPDATE catalog_element SET status='removed',removed_at=now() WHERE id=$1",[f.ids[0]]);
   await tx.query('UPDATE catalog_element SET exposed_type=NULL WHERE id=$1',[f.ids[1]]);
   const [unnameable]=await tx.query<{id:string}>(`INSERT INTO catalog_element(project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal)
    SELECT project_id,object_id,'!!!','text',NULL,'VARCHAR',6 FROM catalog_element WHERE id=$1 RETURNING id`,[f.ids[0]]);
   await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[f.pool,unnameable!.id,f.ctx.projectId,f.ctx.userId]);
  });
  expect((await f.describe()).objects[0]?.columns).toEqual([{name:'field_3',type:'VARCHAR',treatment:'masked'},{name:'field_4',type:'DECIMAL(12,2)',treatment:'aggregate_only'}]);
  const failure=vi.spyOn(f.reader,'read').mockRejectedValueOnce(new Error('never_decided_secret_column'));
  const refused=await f.call();expect(refused).toMatchObject({isError:true,_meta:{code:'dependency_unavailable'}});expect(JSON.stringify(refused)).not.toContain('never_decided_secret_column');failure.mockRestore();
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_object SET status='removed' WHERE source_id=$1",[f.source]));
  expect(await f.describe()).toEqual({objects:[]});
  await withTenant(f.ctx,async tx=>{await tx.query("UPDATE catalog_object SET status='active' WHERE source_id=$1",[f.source]);await tx.query("UPDATE data_source SET status='archived' WHERE id=$1",[f.source]);});
  expect(await f.describe()).toEqual({objects:[]});
 });
});
