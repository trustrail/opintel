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
 it('declares permissions on every read route and shares OpenAPI schemas',()=>{
 const routes=entitlementReadRoutes(new PostgresEntitlementReader());expect(routes.map(r=>r.permission)).toEqual(expect.arrayContaining([expect.objectContaining({permission:'administer'}),expect.objectContaining({permission:'view'})]));expect(Object.keys(entitlementReadOpenApiDocument().paths)).toHaveLength(3);
 });
});
