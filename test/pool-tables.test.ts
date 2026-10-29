import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {bulkFixture} from './fixtures/bulk-entitlements/fixture.js';
import {unwrap} from './fixtures/policy-version/fixture.js';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {SpiceDbAuthorizationPort} from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import {PoolId,ObjectId,SystemClock,type SourceId} from '../src/shared/kernel/index.js';
import {PoolKeyService,PostgresPoolKeys,PostgresPoolTables} from '../src/modules/pools/index.js';
import {poolKeyRoutes} from '../src/modules/pools/api/key-routes.js';
import {poolTableRoutes} from '../src/modules/pools/api/table-routes.js';
import {bulkEntitlementRoutes} from '../src/modules/entitlements/api/bulk-routes.js';
import {PostgresEntitlementReader,BulkEntitlementService,PostgresBulkEntitlements} from '../src/modules/entitlements/index.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {PostgresDescribeReader} from '../src/modules/mcp/index.js';
import {PostgresNeedsYouReader} from '../src/modules/tenancy/index.js';
import {compilePoolRowRule} from '../src/modules/pools/application/row-rule.js';
import {evaluatePredicate} from '../src/shared/row-predicate.js';
import {CreatePoolBody} from '../src/shared/api/pool-keys.js';
resetDatabaseBeforeEach('company','user_account');
let f:Awaited<ReturnType<typeof bulkFixture>>,authorization:SpiceDbAuthorizationPort,tables:PostgresPoolTables,server:ReturnType<typeof createHttpServer>,base:string,object:string,second:string,secondSource:SourceId;
const post=async(path:string,body:unknown,method='POST')=>fetch(base+path,{method,headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(body)});
beforeEach(async()=>{
 f=await bulkFixture(6);
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,f.ctx.userId+'@example.invalid']));
 await withTenant(f.ctx,async tx=>{
  const [o]=await tx.query<{id:string}>('SELECT object_id AS id FROM catalog_element WHERE id=$1',[f.ids[0]]);object=o!.id;
  await tx.query('UPDATE catalog_element SET ordinal=substring(source_identifier from 7)::int');
  const [s]=await tx.query<{id:SourceId}>("INSERT INTO data_source(project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,'Other source','other','postgres','secret://sources/other','connected') RETURNING id",[f.ctx.projectId]);secondSource=s!.id;
  const [t]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','other_records','table','public','other_records') RETURNING id",[f.ctx.projectId,secondSource]);second=t!.id;
  await tx.query("INSERT INTO catalog_element(project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal) VALUES($1,$2,'own_column','integer','own_column','INTEGER',1)",[f.ctx.projectId,second]);
 });
 authorization=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock:new SystemClock(),stalenessCeilingMs:10000});
 await authorization.write([{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}}]);
 tables=new PostgresPoolTables(undefined,authorization);
 const keys=new PoolKeyService(new PostgresPoolKeys(undefined,undefined,undefined,tables),{affected:async()=>({ok:true,value:{affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]}})});
 server=createHttpServer([...poolKeyRoutes(keys),...poolTableRoutes(tables),...bulkEntitlementRoutes(new BulkEntitlementService(new PostgresBulkEntitlements()))],{authorization:{currentUser:async()=>f.actor,port:authorization},logger:{error:()=>{}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const a=server.address();if(!a||typeof a==='string')throw new Error('Missing test address');base='http://127.0.0.1:'+a.port;
});
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));authorization?.close();});
const create=async(name='Table pool',selected=[object,second],rowRule:unknown={column:'field_1',operator:'=',value:'allowed'},startingMode:unknown={kind:'nothing_yet'})=>{
 const response=await post(`/api/v1/projects/${f.ctx.projectId}/pools`,{name,tableSetup:{tables:selected,rowRule,startingMode}});expect(response.status,await response.clone().text()).toBe(200);return response.json() as Promise<{poolId:string;tables:Array<{objectId:string;needsRows:boolean;reason:string|null;copiedColumns:number}>}>;
};
it('PT-001: binds tables across sources and reports missing common-rule columns as zero-row Set rows work',async()=>{
 const pool=await create();expect(pool.tables.find(t=>t.objectId===object)).toMatchObject({needsRows:false});expect(pool.tables.find(t=>t.objectId===second)).toMatchObject({needsRows:true,reason:'column_missing'});
 const needs=unwrap(await new PostgresNeedsYouReader().read(f.ctx,true,null,100));expect(needs.some(n=>n.kind==='missing_row_decision'&&n.title.startsWith('Set rows')&&n.targetRoute.includes(second))).toBe(true);
 const all=unwrap(await tables.list(f.ctx,PoolId(pool.poolId),null,1));expect(all.items).toHaveLength(1);expect(all.nextCursor).not.toBeNull();expect(unwrap(await tables.list(f.ctx,PoolId(pool.poolId),all.nextCursor,1)).items).toHaveLength(1);
});
it('PT-002: a missing/incompatible rule stays zero-row even when an object default exists',async()=>{
 const pool=await create('No numeric match',[second],{column:'own_column',operator:'=',value:'not a number'});
 expect(pool.tables[0]).toMatchObject({needsRows:true,reason:'incompatible_type'});
 await withTenant(f.ctx,async tx=>{await tx.query('INSERT INTO pool_source_binding(project_id,pool_id,source_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[f.ctx.projectId,f.pool,secondSource]);});
 unwrap(await new PostgresRowDecisions().save(f.ctx,f.pool,ObjectId(second),'own_column > 0','object_default'));
 // Explicitly grant the column, then check the actual compiler's zero-row scope.
 const [e]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_element WHERE object_id=$1',[second]));
 const response=await post(`/api/v1/pools/${pool.poolId}/entitlements/bulk`,{projectId:f.ctx.projectId,elementIds:[e!.id],treatment:'clear',justification:'Explicit test decision'});expect(response.status).toBe(200);
 const compiled=unwrap(await new PostgresEntitlementReader().compilation(f.ctx,PoolId(pool.poolId)));expect(compiled.compilation.views[0]?.readPlan.rowScope).toMatchObject({predicate:null,decisionId:null});
});
it('PT-003: table rules append, replace only that table contribution, and explicit all-rows is a typed tautology',async()=>{
 const pool=await create();const changed=await post(`/api/v1/pools/${pool.poolId}/tables/${second}/rows`,{projectId:f.ctx.projectId,rowRule:{allRows:true}},'PUT');expect(changed.status).toBe(200);expect(await changed.json()).toMatchObject({needsRows:false});
 const before=await withTenant(f.ctx,tx=>tx.query<{expression:string}>('SELECT expression FROM row_entitlement WHERE pool_id=$1 ORDER BY sequence',[pool.poolId]));expect(before).toHaveLength(2);expect(before[0]!.expression).toContain('field_1');expect(before[1]!.expression).toContain('IS NULL');
 await post(`/api/v1/pools/${pool.poolId}/tables/${second}/rows`,{projectId:f.ctx.projectId,rowRule:{column:'own_column',operator:'>',value:3}},'PUT');
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM row_entitlement WHERE pool_id=$1',[pool.poolId]))).toHaveLength(3);
 const column={id:randomUUID(),name:'value',sourceIdentifier:'value',type:'INTEGER'},all=compilePoolRowRule({allRows:true},[column]);expect(all.ok).toBe(true);if(all.ok){expect(evaluatePredicate(all.predicate,all.columns,{[column.id]:null})).toBe(true);expect(evaluatePredicate(all.predicate,all.columns,{[column.id]:4})).toBe(true);}
});
it('PT-004: removal hides retained treatment decisions from compiler/describe and re-add does not duplicate or overwrite them',async()=>{
 const pool=await create();await post(`/api/v1/pools/${pool.poolId}/entitlements/bulk`,{projectId:f.ctx.projectId,elementIds:[f.ids[0]],treatment:'clear',justification:'Approved'});
 const removed=await post(`/api/v1/pools/${pool.poolId}/tables/${object}`,{projectId:f.ctx.projectId},'DELETE');expect(removed.status).toBe(200);
 expect(unwrap(await new PostgresDescribeReader().read(f.ctx,PoolId(pool.poolId)))).toHaveLength(0);expect(unwrap(await new PostgresEntitlementReader().compilation(f.ctx,PoolId(pool.poolId))).compilation.views).toHaveLength(0);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT element_id FROM entitlement WHERE pool_id=$1',[pool.poolId]))).toHaveLength(1);
 const added=await post(`/api/v1/pools/${pool.poolId}/tables`,{projectId:f.ctx.projectId,tables:[object]});expect(added.status).toBe(200);expect(unwrap(await new PostgresDescribeReader().read(f.ctx,PoolId(pool.poolId)))).toHaveLength(1);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM row_entitlement WHERE pool_id=$1 AND object_id=$2',[pool.poolId,object]))).toHaveLength(1);
});
it('PT-005: copy_from copies column treatments only by table/column name, leaving unmatched columns undecided',async()=>{
 unwrap(await new PostgresRowDecisions().save(f.ctx,f.pool,ObjectId(object),"field_1 = 'old-scope'"));
 expect((await post(`/api/v1/pools/${f.pool}/credentials`,{projectId:f.ctx.projectId,label:'Original caller'})).status).toBe(200);
 await post(`/api/v1/pools/${f.pool}/entitlements/bulk`,{projectId:f.ctx.projectId,elementIds:f.ids,treatment:'clear',justification:'Source decisions'});
 await withTenant(f.ctx,async tx=>{const [o]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id",[f.ctx.projectId,secondSource]);second=o!.id;await tx.query("INSERT INTO catalog_element(project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal) VALUES($1,$2,'field_1','text','field_1','VARCHAR',1)",[f.ctx.projectId,second]);await tx.query("INSERT INTO catalog_element(project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal) VALUES($1,$2,'new_column','text','new_column','VARCHAR',2)",[f.ctx.projectId,second]);});
 const pool=await create('Copied',[second],{column:'field_1',operator:'=',value:'new-scope'},{kind:'copy_from',poolId:f.pool});expect(pool.tables[0]?.copiedColumns).toBe(1);
 const decisions=await withTenant(f.ctx,tx=>tx.query<{treatment:string}>('SELECT treatment FROM entitlement WHERE pool_id=$1',[pool.poolId]));expect(decisions).toEqual([{treatment:'clear'}]);
 const rows=await withTenant(f.ctx,tx=>tx.query<{expression:string}>('SELECT expression FROM row_entitlement WHERE pool_id=$1',[pool.poolId]));expect(rows).toHaveLength(1);expect(rows[0]!.expression).toContain('new-scope');
 const credentials=await withTenant(f.ctx,tx=>tx.query<{label:string}>('SELECT label FROM pool_credential WHERE pool_id=$1',[pool.poolId]));expect(credentials).toEqual([{label:'Copied'}]);expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM release_grant'))).toHaveLength(0);
});
it('PT-007: table mutations require project administration and row changes require entitlement permission',async()=>{
 const pool=await create();await authorization.write([{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'viewer',subject:{type:'user',id:f.ctx.userId}},{operation:'delete',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}}]);
 expect((await post(`/api/v1/pools/${pool.poolId}/tables`,{projectId:f.ctx.projectId,tables:[second]})).status).toBe(403);
 expect((await post(`/api/v1/pools/${pool.poolId}/tables/${object}`,{projectId:f.ctx.projectId},'DELETE')).status).toBe(403);
 expect((await post(`/api/v1/pools/${pool.poolId}/tables/${object}/rows`,{projectId:f.ctx.projectId,rowRule:{allRows:true}},'PUT')).status).toBe(403);
});
it('PT-008: an existing source-wide pool can remove a table directly without deleting its decisions',async()=>{
 await post(`/api/v1/pools/${f.pool}/entitlements/bulk`,{projectId:f.ctx.projectId,elementIds:[f.ids[0]],treatment:'clear',justification:'Retained decision'});
 const removed=await post(`/api/v1/pools/${f.pool}/tables/${object}`,{projectId:f.ctx.projectId},'DELETE');expect(removed.status,await removed.text()).toBe(200);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT element_id FROM entitlement WHERE pool_id=$1',[f.pool]))).toHaveLength(1);
 expect(unwrap(await new PostgresDescribeReader().read(f.ctx,f.pool))).toHaveLength(0);
});
it('PT-006: rejects unknown/foreign tables before any pool write and validates the rich boundary',async()=>{
 const before=await withTenant(f.ctx,tx=>tx.query('SELECT id FROM pool'));const response=await post(`/api/v1/projects/${f.ctx.projectId}/pools`,{name:'Invalid',tableSetup:{tables:[randomUUID()],rowRule:{allRows:true},startingMode:{kind:'nothing_yet'}}});expect(response.status).toBe(404);expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM pool'))).toHaveLength(before.length);
 const foreign=await bulkFixture(1),[foreignTable]=await withTenant(foreign.ctx,tx=>tx.query<{id:string}>('SELECT object_id AS id FROM catalog_element WHERE id=$1',[foreign.ids[0]]));
 const cross=await post(`/api/v1/projects/${f.ctx.projectId}/pools`,{name:'Foreign table',tableSetup:{tables:[foreignTable!.id],rowRule:{allRows:true},startingMode:{kind:'nothing_yet'}}});expect(cross.status).toBe(404);
 expect(await tables.list(foreign.ctx,f.pool,null,50)).toMatchObject({ok:false,error:{code:'not_found'}});expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM pool'))).toHaveLength(before.length);
 expect(CreatePoolBody.safeParse({name:'Duplicate',tableSetup:{tables:[object,object],rowRule:{allRows:true},startingMode:{kind:'nothing_yet'}}}).success).toBe(false);
});
it('PT-009: copy leaves a new column undecided when same-name source counterparts include an undecided member',async()=>{
 expect((await post(`/api/v1/pools/${f.pool}/entitlements/bulk`,{projectId:f.ctx.projectId,elementIds:[f.ids[0]],treatment:'clear',justification:'One counterpart only'})).status).toBe(200);
 const target=await withTenant(f.ctx,async tx=>{
  const objectWithColumn=async(source:SourceId)=>{const [o]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id",[f.ctx.projectId,source]);await tx.query("INSERT INTO catalog_element(project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal) VALUES($1,$2,'field_1','text','field_1','VARCHAR',1)",[f.ctx.projectId,o!.id]);return o!.id;};
  await objectWithColumn(secondSource);await tx.query('INSERT INTO pool_source_binding(project_id,pool_id,source_id) VALUES($1,$2,$3)',[f.ctx.projectId,f.pool,secondSource]);
  const [s]=await tx.query<{id:SourceId}>("INSERT INTO data_source(project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,'Third source','third','postgres','secret://sources/third','connected') RETURNING id",[f.ctx.projectId]);return objectWithColumn(s!.id);
 });
 const pool=await create('Ambiguous copy',[target],{column:'field_1',operator:'=',value:'own'},{kind:'copy_from',poolId:f.pool});
 expect(pool.tables[0]?.copiedColumns).toBe(0);expect(await withTenant(f.ctx,tx=>tx.query('SELECT element_id FROM entitlement WHERE pool_id=$1',[pool.poolId]))).toHaveLength(0);
});

it('PT-010: one table may belong to several pools; uniqueness is per pool and table',async()=>{
 const first=await create('First shared table',[object]),next=await create('Second shared table',[object]);
 const rows=await withTenant(f.ctx,tx=>tx.query<{pool_id:string;object_id:string}>('SELECT pool_id,object_id FROM pool_table_binding WHERE object_id=$1 ORDER BY pool_id',[object]));
 expect(rows).toEqual([first.poolId,next.poolId].sort().map(pool_id=>({pool_id,object_id:object})));
 await expect(withTenant(f.ctx,tx=>tx.query('INSERT INTO pool_table_binding(project_id,pool_id,object_id) VALUES($1,$2,$3)',[f.ctx.projectId,first.poolId,object]))).rejects.toMatchObject({code:'23505'});
 const constraints=await withPlatform(tx=>tx.query<{kind:string;definition:string}>("SELECT contype::text AS kind,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='pool_table_binding'::regclass AND contype IN ('p','u') ORDER BY conname"));
 expect(constraints).toEqual([{kind:'p',definition:'PRIMARY KEY (pool_id, object_id)'}]);
 const indexes=await withPlatform(tx=>tx.query<{definition:string}>("SELECT pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indrelid='pool_table_binding'::regclass AND indisunique"));
 expect(indexes).toHaveLength(1);expect(indexes[0]!.definition).toContain('(pool_id, object_id)');
});
