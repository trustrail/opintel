import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withTenant } from '../src/platform/db/scope.js';
import { bulkFixture, bulkServer, allowBulk, type BulkFixture } from './fixtures/bulk-entitlements/fixture.js';
import { bulkEntitlementOpenApiDocument, bulkSetEntitlements, BulkEntitlementResponse } from '../src/shared/api/bulk-entitlements.js';
import { createApiClient } from '../src/shared/api/client.js';

let f:BulkFixture,host:Awaited<ReturnType<typeof bulkServer>>;
const decisions=()=>withTenant(f.ctx,tx=>tx.query('SELECT * FROM entitlement ORDER BY element_id'));
const history=()=>withTenant(f.ctx,tx=>tx.query('SELECT * FROM bulk_decision ORDER BY occurred_at'));
describe('4.7 atomic bulk entitlement API',()=>{
 resetDatabaseBeforeEach('company');
 beforeEach(async()=>{f=await bulkFixture();host=await bulkServer(f);});
 afterEach(async()=>{await host.close();});
 it.each(['undecided','reset','',null])('H-009: rejects treatment %j without modifying decisions',async treatment=>{
  expect((await host.post()).status).toBe(200);const before=await decisions();
  expect((await host.post({...f.body,treatment})).status).toBe(400);expect(await decisions()).toEqual(before);expect(await history()).toHaveLength(1);
 });
 it('H-009: offers neither a reset command nor DELETE route',async()=>{
  expect((await host.post()).status).toBe(200);const before=await decisions();
  expect((await fetch(host.url,{method:'DELETE'})).status).toBe(405);
  expect((await fetch(host.url.replace('/bulk','/reset'),{method:'POST'})).status).toBe(404);
  expect((await host.post({...f.body,reset:true})).status).toBe(400);expect(await decisions()).toEqual(before);
 });
 it.each([undefined,null,'',' \t\n '])('H-011: clear requires non-empty justification (%j)',async justification=>{
  expect((await host.post({...f.body,treatment:'clear',justification})).status).toBe(400);
  expect(await decisions()).toEqual([]);expect(await history()).toEqual([]);
 });
 it('requires Idempotency-Key and validates selection and mask shape',async()=>{
  const missing=await fetch(host.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f.body)});expect(missing.status).toBe(400);
  for(const body of [{...f.body,elementIds:[]},{...f.body,elementIds:[f.ids[0],f.ids[0]]},{...f.body,treatment:'masked'},{...f.body,maskKind:'all'}])expect((await host.post(body)).status).toBe(400);
  expect(await decisions()).toEqual([]);
 });
 it('H-012: clear commits per-element justification and one append-only bulk decision',async()=>{
  const response=await host.post({...f.body,treatment:'clear',justification:'Approved for reporting'});expect(response.status).toBe(200);
  const result=BulkEntitlementResponse.parse(await response.json());expect(result).toMatchObject({poolId:f.pool,treatment:'clear',count:3});
  for(const row of await decisions())expect(row).toMatchObject({treatment:'clear',justification:'Approved for reporting',source_kind:'user',source_ref:f.ctx.userId});
  expect(await history()).toEqual([expect.objectContaining({id:result.decisionId,actor_id:f.ctx.userId,pool_id:f.pool,treatment:'clear',count:3,justification:'Approved for reporting'})]);
  for(const sql of ['UPDATE bulk_decision SET justification=\'changed\'','DELETE FROM bulk_decision'])await expect(withTenant(f.ctx,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
  expect((await host.post({...f.body,treatment:'masked',maskKind:'email'})).status).toBe(200);
  expect(await history()).toHaveLength(2);expect((await history())[0]).toMatchObject({justification:'Approved for reporting'});
 });
 it('collects every invalid element and all declaration reasons; does not partially withhold',async()=>{
  expect((await host.post({...f.body,treatment:'clear',justification:'Before'})).status).toBe(200);
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET status='removed' WHERE id=$1",[f.ids[1]]));
  const absent=randomUUID(),before=await decisions();
  const response=await host.post({...f.body,elementIds:[...f.ids,absent]});expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({error:{code:'validation_failed',details:{invalidElements:[{elementId:f.ids[1],reasons:[expect.stringContaining('active')]},{elementId:absent,reasons:[expect.stringContaining('not found')]}]}}});
  expect(await decisions()).toEqual(before);expect(await history()).toHaveLength(1);
 });
 it('collects token domain, timezone and canonicaliser failures without writing decisions',async()=>{
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET token_domain=NULL,exposed_type='TIMESTAMP',canon_id='stdnum1' WHERE id=$1",[f.ids[0]]));
  const response=await host.post({...f.body,treatment:'tokenized'});expect(response.status).toBe(422);
  const body=await response.json();expect(body.error.details.invalidElements).toEqual([{elementId:f.ids[0],reasons:expect.arrayContaining([expect.stringContaining('tokenDomain'),expect.stringContaining('sourceTimezone'),expect.stringContaining('canonicaliser')])}]);
  expect(await decisions()).toEqual([]);expect(await history()).toEqual([]);
 });
 it('rejects incompatible masks and unbound sources for the whole selection',async()=>{
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET exposed_type='INTEGER' WHERE id=$1",[f.ids[0]]));
  expect((await host.post({...f.body,treatment:'masked',maskKind:'email'})).status).toBe(422);
  await withTenant(f.ctx,tx=>tx.query('DELETE FROM pool_source_binding WHERE pool_id=$1',[f.pool]));
  const response=await host.post();expect(response.status).toBe(422);expect((await response.json()).error.details.invalidElements).toHaveLength(3);
  expect(await decisions()).toEqual([]);expect(await history()).toEqual([]);
 });
 it('replays concurrently without repeating decisions and rejects changed bodies for 24 hours',async()=>{
  const key=randomUUID();const responses=await Promise.all([host.post(f.body,key),host.post(f.body,key)]);expect(responses.map(r=>r.status)).toEqual([200,200]);
  const bodies=await Promise.all(responses.map(r=>r.json()));expect(bodies[0]).toEqual(bodies[1]);expect(await history()).toHaveLength(1);
  const before=await decisions();expect(await(await host.post(f.body,key)).json()).toEqual(bodies[0]);expect(await decisions()).toEqual(before);
  const conflict=await host.post({...f.body,treatment:'aggregate_only'},key);expect(conflict.status).toBe(409);expect(await conflict.json()).toMatchObject({error:{code:'idempotency_key_reused'}});
  await withTenant(f.ctx,tx=>tx.query("UPDATE bulk_entitlement_request SET expires_at=now()-interval '1 second'"));
  expect((await host.post({...f.body,treatment:'aggregate_only'},key)).status).toBe(200);expect(await history()).toHaveLength(2);
 });
 it('a 422 writes nothing, including no idempotency receipt; a corrected selection can be retried',async()=>{
  await withTenant(f.ctx,tx=>tx.query('UPDATE catalog_element SET token_domain=NULL'));
  const key=randomUUID(),first=await host.post({...f.body,treatment:'tokenized'},key);expect(first.status).toBe(422);
  expect(await decisions()).toEqual([]);expect(await history()).toEqual([]);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT * FROM bulk_entitlement_request'))).toEqual([]);
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET token_domain='customer'"));
  expect((await host.post({...f.body,treatment:'tokenized'},key)).status).toBe(200);
 });
 it('reports a missing epoch unit explicitly for an integer timestamp',async()=>{
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET exposed_type='BIGINT',canon_id='stdtime1',epoch_unit=NULL WHERE id=$1",[f.ids[0]]));
  const response=await host.post({...f.body,treatment:'tokenized'});expect(response.status).toBe(422);
  expect((await response.json()).error.details.invalidElements).toEqual([{elementId:f.ids[0],reasons:[expect.stringContaining('epochUnit')]}]);
  expect(await history()).toEqual([]);
 });
 it('checks project permission before replay and cannot cross tenant, pool or element boundaries',async()=>{
  expect((await host.post()).status).toBe(200);
  const other=await bulkFixture();const response=await host.post({...f.body,elementIds:[...f.ids,other.ids[0]]});expect(response.status).toBe(422);
  expect((await host.post({...f.body,projectId:other.ctx.projectId})).status).toBe(404);
  expect(await withTenant(other.ctx,tx=>tx.query('SELECT * FROM bulk_decision'))).toEqual([]);
  await host.close();const check=vi.fn<typeof allowBulk.check>(async request=>({...await allowBulk.check(request),allowed:request.permission==='view'}));host=await bulkServer(f,{...allowBulk,check});
  expect((await host.post()).status).toBe(403);expect(check.mock.calls.some(([r])=>r.permission==='set_entitlement'&&r.resource.id===f.ctx.projectId)).toBe(true);
 });
 it('rolls back the bulk history and all writes if the entitlement statement fails',async()=>{
  const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  try{
   await db.query("CREATE FUNCTION test_bulk_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced test failure'; END $$; CREATE TRIGGER test_bulk_failure BEFORE INSERT ON entitlement FOR EACH STATEMENT EXECUTE FUNCTION test_bulk_failure()");
   expect((await host.post()).status).toBe(500);expect(await decisions()).toEqual([]);expect(await history()).toEqual([]);
   expect(await withTenant(f.ctx,tx=>tx.query('SELECT * FROM bulk_entitlement_request'))).toEqual([]);
  }finally{await db.query('DROP TRIGGER IF EXISTS test_bulk_failure ON entitlement; DROP FUNCTION IF EXISTS test_bulk_failure()');await db.end();}
  expect((await host.post()).status).toBe(200);
 });
 it('shares schemas with OpenAPI and the typed client',async()=>{
  const document=bulkEntitlementOpenApiDocument();expect(document.paths['/api/v1/pools/{id}/entitlements/bulk'].post.parameters).toContainEqual(expect.objectContaining({name:'Idempotency-Key',required:true}));
  const client=createApiClient((_path,init)=>fetch(host.url,init));const result=await bulkSetEntitlements(f.pool,{...f.body,maskKind:null,justification:null},randomUUID(),client);expect(result.ok).toBe(true);
 });
});
