import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Client as PgClient} from 'pg';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {bulkFixture} from '../bulk-entitlements/fixture.js';
import {withPlatform,withTenant} from '../../../src/platform/db/scope.js';
import {PoolId,SourceId,RunId,SystemClock,UuidV7IdFactory,ok,type Result} from '../../../src/shared/kernel/index.js';
import {PoolKeyCreationResponse} from '../../../src/shared/api/pool-keys.js';
import {PoolKeyService,PostgresPoolKeys,PostgresKeyVerifier,AgentPresenceService,PostgresAgentPresence,PoolBindingService,PostgresPoolBindings} from '../../../src/modules/pools/index.js';
import {RelationshipOutbox} from '../../../src/modules/tenancy/index.js';
import {SpiceDbAuthorizationPort} from '../../../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import {DescribeService,PostgresDescribeReader,McpAccess,McpHttpServer,PostgresMcpConfiguration,ExplainService,QueryService,PostgresQueryReader,SidecarQueryExecution,type EvidenceWriterPort} from '../../../src/modules/mcp/index.js';
import {QueryPreFilter,DuckDBQueryParser} from '../../../src/modules/entitlements/index.js';
import {createHttpServer} from '../../../src/platform/http/index.js';
import {prepareSidecarDevelopment} from '../../../scripts/sidecar-dev.js';
import {loadSidecarConfig} from '../../../sidecar/config.js';
import {createSidecarServer,sidecarBuild} from '../../../sidecar/http/server.js';
import {PostgresSourceScope} from '../../../sidecar/infrastructure/postgres-source-scope.js';
import {PostgresConnector} from '../../../sidecar/infrastructure/postgres-connector.js';
import {PostgresStagingSource} from '../../../sidecar/execution/infrastructure/postgres-source.js';
import {StagedExecutor} from '../../../sidecar/execution/application/execute.js';
import {DuckDBSessionEngine} from '../../../sidecar/session/index.js';
import {SidecarTokenizer,IanaZoneResolver} from '../../../sidecar/tokenize/index.js';
import {loadSidecarClientOptions} from '../../../src/modules/sources/index.js';
export function unwrap<T>(r:Result<T>):T{if(!r.ok)throw new Error(`${r.error.code}: ${r.error.message}`);return r.value;}
export class TestEvidenceWriter implements EvidenceWriterPort {
 readonly implementation='test-stub' as const;
 readonly records=new Map<RunId,{principal:Parameters<EvidenceWriterPort['open']>[0];sql:string;outcome?:Parameters<EvidenceWriterPort['close']>[1]}>();
 async open(principal:Parameters<EvidenceWriterPort['open']>[0],sql:string){const id=RunId(randomUUID());this.records.set(id,{principal,sql});return ok(id);}
 async close(id:RunId,outcome:Parameters<EvidenceWriterPort['close']>[1]){const record=this.records.get(id);if(!record||record.outcome)throw new Error('Missing or already finished record');record.outcome=outcome;return ok(undefined);}
}
export async function queryFixture(writer:EvidenceWriterPort=new TestEvidenceWriter()){
 const cleanup:Array<()=>Promise<void>>=[];
 const close=async()=>{for(const fn of cleanup.splice(0).reverse())await fn();};
 try{
 const f=await bulkFixture(6),schema='query_'+randomUUID().replaceAll('-','');
 const db=async(sql:string,values?:unknown[])=>{const c=new PgClient({connectionString:process.env.TEST_DATABASE_URL});try{await c.connect();return await c.query(sql,values);}finally{await c.end();}};
 await db(`CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.records(field_1 integer,field_2 integer,field_3 integer,field_4 text,field_5 text,field_6 text); INSERT INTO ${schema}.records SELECT i,1000+i,10,CASE WHEN i<=6 THEN 'large' ELSE 'small' END,'WITHHELD_SENTINEL','UNDECIDED_SENTINEL' FROM generate_series(1,7) i; ANALYZE ${schema}.records`);
 cleanup.push(async()=>{await db(`DROP SCHEMA ${schema} CASCADE`);});
 const authorization=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock:new SystemClock(),stalenessCeilingMs:10000});cleanup.push(async()=>authorization.close());
 await authorization.loadSchema(await readFile('docs/opintel-schema.zed','utf8'));
 await authorization.write([{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}}]);
 await withPlatform(async tx=>{await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]);await tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,JSON.stringify({query:{rowLimit:100,timeoutSeconds:15,memoryLimitMb:128,concurrencyPerPool:2,aggregateMinGroupSize:5}})]);});
 const presence=new PostgresAgentPresence({publish:async()=>{}}),keys=new PoolKeyService(new PostgresPoolKeys(),presence),outbox=new RelationshipOutbox(),bindings=new PoolBindingService(new PostgresPoolBindings(outbox),outbox,authorization);
 const issue=async(name:string)=>{const issued=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'create',name},randomUUID())));if(!issued.keyShown)throw new Error('Missing key');await withTenant(f.ctx,tx=>tx.query('UPDATE pool SET budgets=$2 WHERE id=$1',[issued.poolId,JSON.stringify({threads:1})]));return issued;};
 const issued=await issue('Query pool'),pool=PoolId(issued.poolId);
 unwrap(await bindings.set(f.ctx,pool,f.source,true));
 await withTenant(f.ctx,async tx=>{
  await tx.query('UPDATE catalog_object SET schema_name=$2 WHERE source_id=$1',[f.source,schema]);
  for(const [i,id] of f.ids.entries())await tx.query('UPDATE catalog_element SET ordinal=$2,source_type=$3,exposed_type=$4 WHERE id=$1',[id,i,i<3?'int4':'text',i<3?'INTEGER':'VARCHAR']);
  for(const [i,treatment] of ['clear','tokenized','aggregate_only','clear','withheld'].entries())await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,$4,'user',$5)",[pool,f.ids[i],f.ctx.projectId,treatment,f.ctx.userId]);
 });
 const addSource=async(alias:string)=>{
  const sourceId=SourceId(randomUUID());
  await withTenant(f.ctx,async tx=>{
   await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,$3,$3,'postgres','secret://test/source','connected')",[sourceId,f.ctx.projectId,alias]);
   const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,$3,'records','table','public','records') RETURNING id",[f.ctx.projectId,sourceId,schema]);
   for(const id of f.ids){
    const [element]=await tx.query<{id:string}>(`INSERT INTO catalog_element(project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal,token_domain)
     SELECT project_id,$2,source_identifier,source_type,exposed_name,exposed_type,ordinal,token_domain FROM catalog_element WHERE id=$1 RETURNING id`,[id,object!.id]);
    await tx.query(`INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref)
     SELECT pool_id,$2,project_id,treatment,source_kind,source_ref FROM entitlement WHERE element_id=$1 AND pool_id=$3`,[id,element!.id,pool]);
   }
  });unwrap(await bindings.set(f.ctx,pool,sourceId,true));return sourceId;
 };
 const directory=await mkdtemp(join(tmpdir(),'opintel-query-'));cleanup.push(()=>rm(directory,{recursive:true,force:true}));await prepareSidecarDevelopment(directory);
 const {config,tls}=await loadSidecarConfig(join(directory,'service.json'));
 const secrets={resolve:async()=>process.env.TEST_DATABASE_URL!};
 const scope=new PostgresSourceScope(secrets,{maxConnectionsPerSource:2,statementTimeoutMs:10000,operationTimeoutMs:15000});
 const source=new PostgresStagingSource(scope,new SidecarTokenizer({resolveBytes:async()=>Buffer.alloc(32,1)},new IanaZoneResolver()));
 const boundary={executions:0};
 const executor=new StagedExecutor(source,r=>new DuckDBSessionEngine(undefined,event=>{if(event.stage==='execute_started')boundary.executions++;},resolve('tmp/duckdb-extensions/postgres_scanner.duckdb_extension'),r.limits));
 const host=createSidecarServer({config:{...config,port:0},tls,connector:new PostgresConnector(scope,{record:async()=>{}}),execution:executor,build:{...sidecarBuild,queryEngineVersion:'v1.4.3/d1dc88f950'}});const port=await host.listen();cleanup.push(()=>host.close());
 const execution=new SidecarQueryExecution({...await loadSidecarClientOptions(join(directory,'client.json')),baseUrl:`https://127.0.0.1:${port}`});
 const reader=new PostgresQueryReader(),filter=new QueryPreFilter(new DuckDBQueryParser()),service=new QueryService(reader,filter,execution,authorization,writer);
 const explain=new ExplainService(new PostgresQueryReader(false),filter,execution,authorization,new UuidV7IdFactory());
 const mcp=new McpHttpServer(new McpAccess(new PostgresKeyVerifier(),new AgentPresenceService(presence)),new PostgresMcpConfiguration(),new DescribeService(new PostgresDescribeReader(),authorization),service,explain);
 const server=createHttpServer([],{agentInterface:mcp});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');cleanup.push(async()=>{await mcp.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const url=new URL(`http://127.0.0.1:${address.port}/mcp/v1/p/${f.ctx.projectId}`);
 const connect=async(key:string)=>{const client=new Client({name:'query-test',version:'1'});cleanup.push(()=>client.close());const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{authorization:`Bearer ${key}`,'x-opintel-agent-id':'unverified-agent'}}});await client.connect(transport);return {client,transport,query:(sql:string,maxRows?:number)=>client.callTool({name:'opintel.query',arguments:{sql,...(maxRows===undefined?{}:{maxRows})}})};};
 const agent=await connect(issued.key);
 return {...f,pool,schema,db,issued,issue,keys,bindings,authorization,writer,reader,filter,execution,service,secrets,stagingSource:source,sourceScope:scope,boundary,addSource,host,connect,url,...agent,close};
 }catch(error){await close();throw error;}
}
