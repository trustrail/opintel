import {GroupPage,MemberPage} from '../src/shared/api/entitlement-groups.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { bulkFixture,bulkServer,allowBulk,type BulkFixture } from './fixtures/bulk-entitlements/fixture.js';
import { PostgresEntitlementReader } from '../src/modules/entitlements/index.js';
import { entitlementReadRoutes } from '../src/modules/entitlements/api/read-routes.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { withTenant } from '../src/platform/db/scope.js';
import { EntitlementPage,PoolChoices,ViewDefinitionResponse,entitlementReadOpenApiDocument } from '../src/shared/api/entitlement-read.js';
let f:BulkFixture,host:Awaited<ReturnType<typeof bulkServer>>,server:ReturnType<typeof createHttpServer>,base:string,object:string,permitted:boolean;
const read=(path:string)=>fetch(base+path);
const tree=(params='')=>read(`/pools/${f.pool}/entitlements?projectId=${f.ctx.projectId}${params}`);
describe('4.8 entitlement tree and compiled view inspection',()=>{
 resetDatabaseBeforeEach('company');
 beforeEach(async()=>{permitted=true;f=await bulkFixture(6);host=await bulkServer(f);object=await withTenant(f.ctx,async tx=>{await tx.query("UPDATE catalog_element SET ordinal=split_part(source_identifier,'_',2)::int");const [row]=await tx.query<{id:string}>('SELECT id FROM catalog_object');return row!.id;});server=createHttpServer(entitlementReadRoutes(new PostgresEntitlementReader()),{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async request=>({...await allowBulk.check(request),allowed:permitted})}}});server.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();if(!addr||typeof addr==='string')throw new Error();base=`http://127.0.0.1:${addr.port}/api/v1`;});
 afterEach(async()=>{await host.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
 it('reads pool-bound branches and shows absent decisions as undecided, with scoped cursors',async()=>{
 const pools=PoolChoices.parse(await (await read(`/projects/${f.ctx.projectId}/pools`)).json());expect(pools.items).toEqual([{id:f.pool,name:'Bulk pool',sourceIds:[f.source]}]);
 const root=EntitlementPage.parse(await (await tree()).json());expect(root.nodes.map(n=>n.id)).toEqual([f.source]);
 const schemas=EntitlementPage.parse(await (await tree(`&parent=${f.source}`)).json());expect(schemas.nodes[0]?.label).toBe('public');
 const objects=EntitlementPage.parse(await (await tree(`&parent=${f.source}:public`)).json());expect(objects.nodes[0]?.id).toBe(object);
 const first=EntitlementPage.parse(await (await tree(`&parent=${object}&limit=2`)).json());expect(first.nodes).toHaveLength(2);expect(first.nodes.every(n=>n.treatment===null)).toBe(true);expect(first.nextCursor).toBeTruthy();
 const next=EntitlementPage.parse(await (await tree(`&parent=${object}&limit=2&cursor=${first.nextCursor}`)).json());expect(next.nodes.every(n=>!first.nodes.some(a=>a.id===n.id))).toBe(true);
 expect((await tree(`&parent=${object}&undecided=true&cursor=${first.nextCursor}`)).status).toBe(400);
 expect((await tree('&parent=bad')).status).toBe(404);
 });
 it('reads existing decisions per pool and filters undecided without implying unsupported fields are decided',async()=>{
 await host.post({...f.body,elementIds:[f.ids[0]],treatment:'clear',justification:'Required for reporting'});
 const page=EntitlementPage.parse(await (await tree(`&parent=${object}`)).json());expect(page.nodes.find(n=>n.id===f.ids[0])).toMatchObject({treatment:'clear',justification:'Required for reporting'});expect(page.nodes.filter(n=>n.treatment===null)).toHaveLength(5);
 const undecided=EntitlementPage.parse(await (await tree(`&parent=${object}&undecided=true`)).json());expect(undecided.nodes).toHaveLength(5);expect(undecided.nodes.some(n=>n.id===f.ids[0])).toBe(false);
 const other=await bulkFixture();expect((await read(`/pools/${other.pool}/entitlements?projectId=${f.ctx.projectId}`)).status).toBe(404);
 expect((await tree(`&parent=${other.source}:public`)).status).toBe(404);
 });
 it('H-018: the real compiler emits exactly clear, tokenized, masked and aggregate-only fields, excluding withheld and undecided',async()=>{
 await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET exposed_type='INTEGER',source_type='integer' WHERE id=$1",[f.ids[3]]));
 for(const [i,treatment,maskKind] of [[0,'clear',null],[1,'tokenized',null],[2,'masked','all'],[3,'aggregate_only',null],[4,'withheld',null]] as const){expect((await host.post({...f.body,elementIds:[f.ids[i]],treatment,maskKind,justification:'Reporting approval'})).status).toBe(200);}
 const response=await read(`/pools/${f.pool}/view-definition?projectId=${f.ctx.projectId}`);expect(response.status).toBe(200);const result=ViewDefinitionResponse.parse(await response.json());expect(result.views).toHaveLength(1);const ddl=result.views[0]!.ddl;
 for(const field of ['field_1','field_2','field_3','field_4'])expect(ddl).toContain(`"${field}"`);for(const field of ['field_5','field_6','_opintel_'])expect(ddl).not.toContain(field);
 expect(ddl.match(/"field_\d"/gu)).toEqual(['"field_1"','"field_2"','"field_3"','"field_4"']);
 });
 it('H-018: all-undecided and all-withheld objects emit no dummy view',async()=>{
 const path=`/pools/${f.pool}/view-definition?projectId=${f.ctx.projectId}`;
 expect(ViewDefinitionResponse.parse(await (await read(path)).json())).toMatchObject({views:[],omitted:[{reason:'all_undecided'}]});
 await host.post();expect(ViewDefinitionResponse.parse(await (await read(path)).json())).toMatchObject({views:[],omitted:[{reason:'all_withheld'}]});
 expect((await read(`/pools/${randomUUID()}/view-definition?projectId=${f.ctx.projectId}`)).status).toBe(404);
 });
 it('enforces permission rejection before reading tenant decisions or DDL',async()=>{
 permitted=false;expect((await tree()).status).toBe(404);expect((await read(`/pools/${f.pool}/view-definition?projectId=${f.ctx.projectId}`)).status).toBe(404);expect((await read(`/projects/${f.ctx.projectId}/pools`)).status).toBe(404);
 });
 it('RED-005: groups exact names across objects and exposes mixed types/decisions before expansion',async()=>{
 await withTenant(f.ctx,async tx=>{
 const [o]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','second','table','public','second') RETURNING id",[f.ctx.projectId,f.source]);
 await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type) VALUES($1,$2,$3,'field_1','integer','field_1','INTEGER')",[randomUUID(),f.ctx.projectId,o!.id]);
 });
 await host.post({...f.body,elementIds:[f.ids[0]],treatment:'clear',justification:'Reviewed'});
 const path=`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}`;
 const all=GroupPage.parse(await (await read(path+'&decision=all')).json()),group=all.items.find(g=>g.name==='field_1')!;
 expect(group.count).toBe(2);expect(group.objects).toBe(2);expect(group.types).toEqual(expect.arrayContaining([{value:'INTEGER',count:1},{value:'VARCHAR',count:1}]));expect(group.decisions).toEqual(expect.arrayContaining([{value:'clear',count:1},{value:'undecided',count:1}]));
 const pending=GroupPage.parse(await (await read(path)).json());expect(pending.items.find(g=>g.name==='field_1')).toMatchObject({count:1,decisions:[{value:'undecided',count:1}]});expect(pending.totals).toMatchObject({members:6,undecided:6});
 const members=MemberPage.parse(await (await read(`/pools/${f.pool}/entitlement-members?projectId=${f.ctx.projectId}&group=name:field_1`)).json());expect(members.items).toHaveLength(1);expect(members.items[0]!.id).not.toBe(f.ids[0]);expect(members.items[0]!).toMatchObject({qualifiedName:'warehouse.public.second.field_1',objectName:'warehouse.public.second',objectLabel:'second'});
 const tables=GroupPage.parse(await (await read(path+'&decision=all&mode=table')).json());expect(tables.totals.groups).toBe(2);
 });
 it('RED-006: Review all traverses scoped member pages; another filter, pool or tenant cannot reuse cursors',async()=>{
 const path=`/pools/${f.pool}/entitlement-members?projectId=${f.ctx.projectId}&limit=2`;let cursor:string|null=null;const ids:string[]=[];
 do{const page=MemberPage.parse(await (await read(path+(cursor?'&cursor='+cursor:''))).json());ids.push(...page.items.map(m=>m.id));cursor=page.nextCursor;}while(cursor);
 expect(new Set(ids)).toEqual(new Set(f.ids));
 const first=MemberPage.parse(await (await read(path)).json());expect((await read(path+'&decision=all&cursor='+first.nextCursor)).status).toBe(400);
 expect((await read(path+'&sourceId='+randomUUID())).status).toBe(200);expect(MemberPage.parse(await (await read(path+'&sourceId='+randomUUID())).json()).items).toEqual([]);
 const groups=GroupPage.parse(await (await read(`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}&limit=2`)).json());expect(groups.totals.members).toBe(6);expect(groups.items).toHaveLength(2);expect(groups.nextCursor).toBeTruthy();
 expect((await read(`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}&decision=all&cursor=${groups.nextCursor}`)).status).toBe(400);
 const other=await bulkFixture();expect((await read(`/pools/${other.pool}/entitlement-groups?projectId=${f.ctx.projectId}`)).status).toBe(404);
 permitted=false;expect((await read(path)).status).toBe(404);expect((await read(`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}`)).status).toBe(404);
 });
 it('RED-005: Join attempted counts refused query and explain attempts distinctly, once per group, in this pool only',async()=>{
 await withTenant(f.ctx,async tx=>{
 const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','join_peer','table','public','join_peer') RETURNING id",[f.ctx.projectId,f.source]);
 const peer=randomUUID();await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type) VALUES($1,$2,$3,'field_1','text','field_1','VARCHAR')",[peer,f.ctx.projectId,object!.id]);
 await tx.query(`INSERT INTO token_join_candidate(id,operation,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at) VALUES($1,'explain',$2,$3,$4,$5,'a.shared','b.shared','agent','SELECT secret_literal',clock_timestamp())`,[randomUUID(),f.ctx.projectId,f.pool,f.ids[0],peer]);
 const run=randomUUID(),at=new Date();
 await tx.query("INSERT INTO query_run(id,project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'agent','prefix','query','SELECT secret_literal',$4,$5)",[run,f.ctx.projectId,f.pool,{policy:1,vocabulary:1,catalog:1,tokenKeyVersionSelected:1},at]);
 await tx.query("INSERT INTO token_join_candidate(id,run_id,operation,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at) VALUES($1,$1,'query',$2,$3,$4,$5,'a.field_1','b.field_1','agent','SELECT secret_literal',$6)",[run,f.ctx.projectId,f.pool,f.ids[0],peer,at]);
 const other=randomUUID();await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Other')",[other,f.ctx.projectId]);
 await tx.query(`INSERT INTO token_join_candidate(id,operation,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at) VALUES($1,'explain',$2,$3,$4,$5,'a.shared','b.shared','agent','SELECT secret_literal',clock_timestamp())`,[randomUUID(),f.ctx.projectId,other,f.ids[0],peer]);
 });
 const response=await read(`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}`),body=await response.text();expect(body).not.toContain('secret_literal');const page=GroupPage.parse(JSON.parse(body));expect(page.items.find(g=>g.name==='field_1')).toMatchObject({count:2,queries:1,explains:1});
 });
 it('RED-005: masked members expose distinct mask kinds rather than implying one decision',async()=>{
 const peer=randomUUID();await withTenant(f.ctx,async tx=>{const [o]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','masked_peer','table','public','masked_peer') RETURNING id",[f.ctx.projectId,f.source]);await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type) VALUES($1,$2,$3,'field_1','text','field_1','VARCHAR')",[peer,f.ctx.projectId,o!.id]);});
 expect((await host.post({...f.body,elementIds:[f.ids[0]],treatment:'masked',maskKind:'all'})).status).toBe(200);expect((await host.post({...f.body,elementIds:[peer],treatment:'masked',maskKind:'last4'})).status).toBe(200);
 const page=GroupPage.parse(await (await read(`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}&decision=all`)).json());expect(page.items.find(g=>g.name==='field_1')).toMatchObject({count:2,decisions:[{value:'masked',count:2}],maskKinds:[{value:'all',count:1},{value:'last4',count:1}]});
 });
 it('RED-010: a targeted decision scope returns only the linked element and binds its cursors',async()=>{
 const path=`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}&decision=all&elementId=${f.ids[0]}`;
 const groups=GroupPage.parse(await (await read(path)).json());expect(groups.totals).toMatchObject({members:1,groups:1});expect(groups.items[0]).toMatchObject({name:'field_1',count:1});
 const members=MemberPage.parse(await (await read(`/pools/${f.pool}/entitlement-members?projectId=${f.ctx.projectId}&decision=all&elementId=${f.ids[0]}`)).json());expect(members.items.map(m=>m.id)).toEqual([f.ids[0]]);
 const other=await bulkFixture();expect(GroupPage.parse(await (await read(path.replace(f.ids[0]!,other.ids[0]!))).json()).items).toEqual([]);
 const broad=GroupPage.parse(await (await read(`/pools/${f.pool}/entitlement-groups?projectId=${f.ctx.projectId}&decision=all&limit=1`)).json());expect(broad.nextCursor).toBeTruthy();expect((await read(path+'&cursor='+broad.nextCursor)).status).toBe(400);
 });
 it('declares permissions on every read route and shares OpenAPI schemas',()=>{
 const routes=entitlementReadRoutes(new PostgresEntitlementReader());expect(routes.map(r=>r.permission)).toEqual(expect.arrayContaining([expect.objectContaining({permission:'administer'}),expect.objectContaining({permission:'view'})]));expect(Object.keys(entitlementReadOpenApiDocument().paths)).toHaveLength(5);
 });
});
