import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {bulkFixture} from './fixtures/bulk-entitlements/fixture.js';
import {unwrap} from './fixtures/policy-version/fixture.js';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {SpiceDbAuthorizationPort} from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import {PoolKeyService,PostgresPoolKeys,PostgresPoolBudgets,PostgresKeyVerifier} from '../src/modules/pools/index.js';
import {poolKeyRoutes} from '../src/modules/pools/api/key-routes.js';
import {poolBudgetRoutes} from '../src/modules/pools/api/budget-routes.js';
import {PoolId,SystemClock} from '../src/shared/kernel/index.js';
import {PoolBudgetValues,poolBudgetsOpenApiDocument} from '../src/shared/api/pool-budgets.js';
import {PostgresQueryReader} from '../src/modules/mcp/infrastructure/query-reader.js';
resetDatabaseBeforeEach('company','user_account');
let f:Awaited<ReturnType<typeof bulkFixture>>,authorization:SpiceDbAuthorizationPort,server:ReturnType<typeof createHttpServer>,base:string;
const values={threads:1,rowsPerRequest:40,timeoutMs:3000,memoryMb:64,concurrency:1,rowsPerDay:1000};
async function call(path:string,method='GET',body?:unknown,key=randomUUID()){return fetch(base+path,{method,headers:{'content-type':'application/json','idempotency-key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function create(budgets?:unknown){const response=await call(`/api/v1/projects/${f.ctx.projectId}/pools`,'POST',{name:randomUUID(),...(budgets===undefined?{}:{budgets})});expect(response.status).toBe(200);return response.json() as Promise<{poolId:string;key:string}>;}
const read=(pool:string)=>call(`/api/v1/pools/${pool}/budgets?projectId=${f.ctx.projectId}`);
const change=(pool:string,budgets:unknown)=>call(`/api/v1/pools/${pool}/budgets`,'PATCH',{projectId:f.ctx.projectId,budgets});
beforeEach(async()=>{
 f=await bulkFixture(0);await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,f.ctx.userId+'@example.invalid']));
 authorization=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock:new SystemClock(),stalenessCeilingMs:10000});
 await authorization.write([{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}}]);
 const keys=new PoolKeyService(new PostgresPoolKeys(),{affected:async()=>({ok:true,value:{affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]}})});
 server=createHttpServer([...poolKeyRoutes(keys),...poolBudgetRoutes(new PostgresPoolBudgets())],{authorization:{currentUser:async()=>f.actor,port:authorization},logger:{error:()=>{}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');base='http://127.0.0.1:'+address.port;
});
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));authorization?.close();});
it('PB-001: all six explicit creation inputs round-trip; omitted budgets remain absent with no backend suggestions',async()=>{
 const p=await create(values);expect(await(await read(p.poolId)).json()).toEqual({poolId:p.poolId,budgets:values});
 const empty=await create();expect(await(await read(empty.poolId)).json()).toEqual({poolId:empty.poolId,budgets:{}});
 const audits=await withTenant(f.ctx,tx=>tx.query<{before:unknown;after:unknown}>("SELECT before,after FROM audit_entry WHERE action='PoolBudgetsChanged' AND target->>'poolId'=$1",[p.poolId]));expect(audits).toEqual([{before:{},after:values}]);
});
it('PB-002: creation and changes reject zero, negative, fractional, unsafe, textual and null values uniformly',async()=>{
 const p=await create();
 for(const name of Object.keys(values))for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1',null]){
  expect((await call(`/api/v1/projects/${f.ctx.projectId}/pools`,'POST',{name:randomUUID(),budgets:{[name]:value}})).status).toBe(400);
  expect((await change(p.poolId,{[name]:value})).status).toBe(400);
 }
 expect((await change(p.poolId,{})).status).toBe(400);expect((await change(p.poolId,{invented:1})).status).toBe(400);
 expect(await(await read(p.poolId)).json()).toEqual({poolId:p.poolId,budgets:{}});
});
it('PB-003: changes merge without losing omitted fields; concurrent changes serialize and immutable audit snapshots record each change once',async()=>{
 const p=await create(values);
 const results=await Promise.all([change(p.poolId,{threads:2}),change(p.poolId,{memoryMb:96})]);expect(results.map(r=>r.status)).toEqual([200,200]);
 const expected={...values,threads:2,memoryMb:96};expect((await(await read(p.poolId)).json()).budgets).toEqual(expected);
 expect((await change(p.poolId,{threads:2})).status).toBe(200);
 const audits=await withTenant(f.ctx,tx=>tx.query<{before:Record<string,number>;after:Record<string,number>;actor_id:string;actor_kind:string}>("SELECT before,after,actor_id,actor_kind FROM audit_entry WHERE action='PoolBudgetsChanged' AND target->>'poolId'=$1 ORDER BY occurred_at,id",[p.poolId]));
 expect(audits).toHaveLength(3);expect(audits.every(a=>a.actor_id===f.ctx.userId&&a.actor_kind==='user')).toBe(true);
 expect(audits[0]!.before).toEqual({});expect(audits[0]!.after).toEqual(values);const initial=audits.find(a=>Object.keys(a.before).length===0),first=audits.find(a=>isDeepStrictEqual(a.before,initial?.after)),last=audits.find(a=>isDeepStrictEqual(a.after,expected));expect(initial?.after).toEqual(values);expect(first).toBeDefined();expect(last?.before).toEqual(first?.after);expect(last?.after).toEqual(expected);
});
it('PB-004: viewer can read but cannot change; foreign-project pool IDs are not exposed or mutated',async()=>{
 const p=await create(values),other=await bulkFixture(0);
 expect((await read(other.pool)).status).toBe(404);expect((await change(other.pool,{threads:2})).status).toBe(404);
 await authorization.write([{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'viewer',subject:{type:'user',id:f.ctx.userId}},{operation:'delete',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}}]);
 expect((await read(p.poolId)).status).toBe(200);expect((await change(p.poolId,{threads:2})).status).toBe(403);
 expect((await(await read(p.poolId)).json()).budgets).toEqual(values);
});
it('PB-005: query still refuses missing threads; explicit budgets are capped by project limits and rowsPerDay does not invent daily enforcement',async()=>{
 await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{query}',$2::jsonb,true) WHERE id=$1",[f.ctx.projectId,{rowLimit:100,timeoutSeconds:10,memoryLimitMb:128,concurrencyPerPool:2,aggregateMinGroupSize:5}]));
 const p=await create();const verdict=await new PostgresKeyVerifier().verify(p.key);if(!verdict.ok)throw new Error('Missing principal');const principal={...verdict,agentId:'budget-test'},reader=new PostgresQueryReader();
 const missing=await reader.read(principal);expect(missing.ok).toBe(false);if(!missing.ok)expect(missing.error.details).toMatchObject({cause:'invalid_settings',reason:'query_limits'});
 expect((await change(p.poolId,{threads:1})).status).toBe(200);expect(unwrap(await reader.read(principal)).limits).toEqual({rowLimit:100,timeoutMs:10000,memoryMb:128,threads:1,concurrency:2});
 expect((await change(p.poolId,values)).status).toBe(200);expect(unwrap(await reader.read(principal)).limits).toEqual({rowLimit:40,timeoutMs:3000,memoryMb:64,threads:1,concurrency:1});
 expect((await change(p.poolId,{rowsPerRequest:1000,timeoutMs:20000,memoryMb:256,concurrency:5})).status).toBe(200);expect(unwrap(await reader.read(principal)).limits).toEqual({rowLimit:100,timeoutMs:10000,memoryMb:128,threads:1,concurrency:2});
 expect((await(await read(p.poolId)).json()).budgets.rowsPerDay).toBe(1000);
});
it('PB-006: public schemas publish identical positive-integer validation and no defaults',()=>{
 expect(PoolBudgetValues.parse({})).toEqual({});const document=JSON.stringify(poolBudgetsOpenApiDocument());expect(JSON.stringify(PoolBudgetValues.toJSONSchema())).not.toContain('"default":');
 for(const name of Object.keys(values)){expect(PoolBudgetValues.safeParse({[name]:1}).success).toBe(true);expect(document).toContain('"'+name+'"');}
});

it('PB-007: creation replay neither overwrites a later budget decision nor repeats its audit; different budgets conflict',async()=>{
 const path=`/api/v1/projects/${f.ctx.projectId}/pools`,key=randomUUID(),body={name:'Budget replay',budgets:{threads:1}};
 const created=await call(path,'POST',body,key);expect(created.status).toBe(200);const p=await created.json() as {poolId:string};
 expect((await change(p.poolId,{threads:2})).status).toBe(200);
 const replay=await call(path,'POST',body,key);expect(replay.status).toBe(200);expect((await replay.json()).keyShown).toBe(false);
 expect((await(await read(p.poolId)).json()).budgets).toEqual({threads:2});
 expect((await call(path,'POST',{...body,budgets:{threads:3}},key)).status).toBe(409);
 const audits=await withTenant(f.ctx,tx=>tx.query("SELECT id FROM audit_entry WHERE action='PoolBudgetsChanged' AND target->>'poolId'=$1",[p.poolId]));expect(audits).toHaveLength(2);
});
