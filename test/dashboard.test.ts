import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {it,expect} from 'vitest';
import {PostgresDashboardReader} from '../src/modules/tenancy/index.js';
import {dashboardRoutes} from '../src/modules/tenancy/api/dashboard-routes.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {TestClock,PoolId} from '../src/shared/kernel/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {allowBulk} from './fixtures/bulk-entitlements/fixture.js';
import {DashboardFeed,DashboardStats} from '../src/shared/api/dashboard.js';
it('5.15 counts decisions across pools, including undecided; excludes removed and archived data',async()=>{
 const f=await policyFixture(3),reader=new PostgresDashboardReader(),second=PoolId(randomUUID());await f.set('clear',randomUUID(),[f.ids[0]!]);
 await withTenant(f.ctx,async tx=>{await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Second')",[second,f.ctx.projectId]);await tx.query('INSERT INTO pool_source_binding(pool_id,project_id,source_id) VALUES($1,$2,$3)',[second,f.ctx.projectId,f.source]);await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'withheld','user',$4)",[second,f.ids[0],f.ctx.projectId,f.ctx.userId]);});
 expect(unwrap(await reader.stats(f.ctx))).toMatchObject({pools:2,spectrum:{clear:1,withheld:1,undecided:4}});
 const shields=unwrap(await reader.pools(f.ctx,null,10));expect(shields).toHaveLength(2);expect(shields.find(p=>p.id===second)?.spectrum).toMatchObject({clear:0,withheld:1,undecided:2});
 expect(unwrap(await reader.feed(f.ctx,null,10))).toEqual(expect.arrayContaining([expect.objectContaining({poolId:second,count:2}),expect.objectContaining({poolId:f.pool,count:2})]));
 await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET status='removed',removed_at=now() WHERE id=$1",[f.ids[0]]));expect(unwrap(await reader.stats(f.ctx)).spectrum).toMatchObject({clear:0,withheld:0,undecided:4});
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='archived' WHERE id=$1",[f.source]));expect(unwrap(await reader.stats(f.ctx)).spectrum.undecided).toBe(0);expect(unwrap(await reader.feed(f.ctx,null,10))).toEqual([]);
});
it('5.15 UTC today starts at midnight; incomplete headers are requests, not refusals',async()=>{
 const f=await policyFixture(0),day=new Date().toISOString().slice(0,10),clock=new TestClock(new Date(day+'T00:30:00Z')),reader=new PostgresDashboardReader(clock),midnight=Date.parse(day+'T00:00:00Z');
 await withTenant(f.ctx,async tx=>{for(const [offset,mode,outcome] of [[-1,'query',{kind:'answered',rowCount:0,truncated:false}],[0,'query',null],[1,'prompt',{kind:'refused',code:'undecided_element',element:null,stage:'validate'}],[2,'query',{kind:'answered',rowCount:0,truncated:false}]] as const){const id=randomUUID(),at=new Date(midnight+offset).toISOString();await tx.query("INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'opk_test',$4,'secret literal',$5,$6)",[id,f.ctx.projectId,f.pool,mode,{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null},at]);if(outcome)await tx.query('INSERT INTO run_completion(run_id,started_at,outcome,completed_at) VALUES($1,$2,$3,$2)',[id,at,outcome]);}});
 const stats=unwrap(await reader.stats(f.ctx));expect(stats).toMatchObject({utcDay:day,requests:3,queries:2,prompts:1,refused:1,incomplete:1});expect(JSON.stringify(stats)).not.toContain('secret literal');
});
it('O-004: clean means no findings even at 100% clear; quarantine is a metadata-only live projection',async()=>{
 const f=await policyFixture(2),reader=new PostgresDashboardReader();await f.set();expect(unwrap(await reader.feed(f.ctx,null,20))).toEqual([]);
 const id=randomUUID(),payload={outcome:'quarantined',quarantineCategory:'verification_mismatch',receivedAt:new Date().toISOString(),filename:'PRIVATE.xlsx',reason:'private cell value'};
 await withTenant(f.ctx,tx=>tx.query('INSERT INTO arrival_notice(filing_id,project_id,source_id,revision,payload) VALUES($1,$2,$3,1,$4)',[id,f.ctx.projectId,f.source,payload]));const rows=unwrap(await reader.feed(f.ctx,null,20));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({kind:'quarantine',category:'verification_mismatch',filingId:id});expect(JSON.stringify(rows)).not.toMatch(/PRIVATE|private cell|filename|reason/);
 await withTenant(f.ctx,tx=>tx.query("UPDATE arrival_notice SET payload=payload||'{\"outcome\":\"landed\"}'::jsonb WHERE filing_id=$1",[id]));expect(unwrap(await reader.feed(f.ctx,null,20))).toEqual([]);
});
it('dashboard routes require project view and bind cursors and rows to the project',async()=>{
 const f=await policyFixture(1),other=await policyFixture(1),reader=new PostgresDashboardReader();let allowed=true;
 const server=createHttpServer(dashboardRoutes(reader),{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async r=>{expect(r.permission).toBe('view');return {...await allowBulk.check(r),allowed};}}}});server.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();if(!addr||typeof addr==='string')throw new Error();const base=`http://127.0.0.1:${addr.port}/api/v1/projects`;
 try{const response=await fetch(`${base}/${f.ctx.projectId}/stats`);expect(response.status).toBe(200);expect(DashboardStats.parse(await response.json()).pools).toBe(1);expect(response.headers.get('cache-control')).toBe('no-store');
 const page=DashboardFeed.parse(await (await fetch(`${base}/${f.ctx.projectId}/dashboard/feed?limit=1`)).json());expect(page.items[0]).toMatchObject({poolId:f.pool});expect(JSON.stringify(page)).not.toContain(other.pool);
 const cursor=Buffer.from(JSON.stringify({scope:JSON.stringify([other.ctx.projectId,'feed']),after:'a'})).toString('base64url');expect((await fetch(`${base}/${f.ctx.projectId}/dashboard/feed?cursor=${cursor}`)).status).toBe(400);
 allowed=false;expect((await fetch(`${base}/${f.ctx.projectId}/stats`)).status).toBe(404);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
it('current source failures leave the feed after recovery; all feed pages are reachable',async()=>{
 const f=await policyFixture(1),reader=new PostgresDashboardReader(),run=randomUUID();
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO introspection_run(id,source_id,project_id,state,error) VALUES($1,$2,$3,'failed','Connection refused. Check the source and retry.')",[run,f.source,f.ctx.projectId]));
 const first=unwrap(await reader.feed(f.ctx,null,1));expect(first[0]).toMatchObject({kind:'source_failure',runId:run});
 const second=unwrap(await reader.feed(f.ctx,first[0]!.id,1));expect(second[0]).toMatchObject({kind:'undecided',count:1});
 expect(unwrap(await reader.feed(f.ctx,second[0]!.id,1))).toEqual([]);
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO introspection_run(source_id,project_id,state) VALUES($1,$2,'complete')",[f.source,f.ctx.projectId]));expect(unwrap(await reader.feed(f.ctx,null,20)).some(f=>f.kind==='source_failure')).toBe(false);
});
it('connected and stale counts use presence deadlines without inventing an expected-agent count',async()=>{
 const {presenceFixture}=await import('./fixtures/agent-presence/fixture.js');const f=await presenceFixture(),reader=new PostgresDashboardReader(f.clock);unwrap(await f.signal('connect'));
 expect(unwrap(await reader.stats(f.ctx))).toMatchObject({connectedAgents:1,staleAgents:0});f.clock.advance(60000);expect(unwrap(await reader.stats(f.ctx))).toMatchObject({connectedAgents:0,staleAgents:1});f.clock.advance(300000);expect(unwrap(await reader.stats(f.ctx))).toMatchObject({connectedAgents:0,staleAgents:0});
});
