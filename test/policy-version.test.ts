import { randomUUID } from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { withTenant,withPlatform } from '../src/platform/db/scope.js';
import { Entitlement,PostgresEntitlements,PostgresPatternRules,PostgresEntitlementReader } from '../src/modules/entitlements/index.js';
import { Timestamp,UuidV7IdFactory,ElementId } from '../src/shared/kernel/index.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { policyFixture,unwrap,type PolicyFixture } from './fixtures/policy-version/fixture.js';
let f:PolicyFixture;
const rawInsert=(fixture:PolicyFixture,index=0)=>withTenant(fixture.ctx,tx=>tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[fixture.pool,fixture.ids[index],fixture.ctx.projectId,fixture.ctx.userId]));
describe('4.9 database-enforced project policy versions',()=>{
 resetDatabaseBeforeEach('company');beforeEach(async()=>{f=await policyFixture();});afterEach(()=>vi.useRealTimers());
 it('M-005: identical policy reads a logical minute apart retain the same version',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const first=await f.version();vi.setSystemTime(new Date('2030-01-01T00:01:00Z'));
  expect(await f.version()).toBe(first);
 });
 it('M-006: changing a decision changes the project version and the recompiled projection',async()=>{
  await f.set();const reader=new PostgresEntitlementReader(),before=await f.version();
  expect(unwrap(await reader.definition(f.ctx,f.pool)).views[0]?.ddl).toContain('"field_1"');
  await f.set('withheld',randomUUID(),[f.ids[0]!]);
  expect(await f.version()).toBe(before+1);
  const ddl=unwrap(await reader.definition(f.ctx,f.pool)).views[0]!.ddl;
  expect(ddl).not.toContain('"field_1"');expect(ddl).toContain('"field_2"');
 });
 it('every writer: single-decision repository advances on insert and update',async()=>{
  const repo=new PostgresEntitlements(),before=await f.version();
  for(const [index,treatment] of (['clear','withheld'] as const).entries()){
   const decision=unwrap(Entitlement.decide({poolId:f.pool,elementId:f.ids[0]!,projectId:f.ctx.projectId,treatment,maskKind:null,setBy:{kind:'user',id:f.ctx.userId},setAt:Timestamp(new Date()),justification:'Approved'}));
   unwrap(await repo.set(f.ctx,decision));expect(await f.version()).toBe(before+index+1);
  }
 });
 it('every writer: bulk set of 500 inserts or updates advances once; receipt replay advances nothing',async()=>{
  f=await policyFixture(500);const before=await f.version(),key=randomUUID();
  expect((await f.set('clear',key)).status).toBe(200);expect(await f.version()).toBe(before+1);
  expect((await f.set('clear',key)).status).toBe(200);expect(await f.version()).toBe(before+1);
  expect((await f.set('withheld')).status).toBe(200);expect(await f.version()).toBe(before+2);
 },30_000);
 it('every writer: pattern rule application advances the version through introspection completion',async()=>{
  const rules=new PostgresPatternRules(new UuidV7IdFactory());
  const rule=unwrap(await rules.create(f.ctx,{matcher:'discovered_later',matchKind:'name_glob',treatment:'clear'}));
  const before=await f.version();expect((await f.introspect('text',['discovered_later'])).state).toBe('complete');
  expect(await f.version()).toBe(before+1);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT source_kind,source_ref FROM entitlement'))).toEqual([{source_kind:'rule',source_ref:rule.id}]);
 });
 it('every writer: type-family deletion advances once and leaves the invalidated elements undecided',async()=>{
  await f.set();const before=await f.version(),run=await f.introspect('integer');
  expect(run.state).toBe('complete');expect(run.diff.filter(d=>d.type==='CatalogElementTypeFamilyChanged')).toHaveLength(3);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT * FROM entitlement'))).toEqual([]);
  expect(await f.version()).toBe(before+1);
 });
 it('direct SQL insert, update and delete statements in one transaction advance only once',async()=>{
  const before=await f.version();
  await withTenant(f.ctx,async tx=>{
   for(const id of f.ids)await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[f.pool,id,f.ctx.projectId,f.ctx.userId]);
   await tx.query("UPDATE entitlement SET treatment='withheld'");await tx.query('DELETE FROM entitlement');
  });expect(await f.version()).toBe(before+1);
 });
 it('an upsert that inserts and updates rows in the same statement advances only once',async()=>{
  await rawInsert(f);const before=await f.version();
  expect((await f.set('withheld')).status).toBe(200);expect(await f.version()).toBe(before+1);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT treatment FROM entitlement'))).toEqual(Array.from({length:3},()=>({treatment:'withheld'})));
 });
 it('zero-row statements and rejected bulk commands do not advance the version',async()=>{
  const before=await f.version();await withTenant(f.ctx,async tx=>{await tx.query("UPDATE entitlement SET treatment='clear'");await tx.query('DELETE FROM entitlement');});
  expect((await f.set('clear',randomUUID(),[f.ids[0]!,ElementId(randomUUID())])).status).toBe(422);expect(await f.version()).toBe(before);
 });
 it('rollback restores the version and a later transaction can advance it',async()=>{
  const before=await f.version();
  await expect(withTenant(f.ctx,async tx=>{await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[f.pool,f.ids[0],f.ctx.projectId,f.ctx.userId]);throw new Error('abort');})).rejects.toThrow('abort');
  expect(await f.version()).toBe(before);
  await rawInsert(f);expect(await f.version()).toBe(before+1);
 });
 it('concurrent transactions do not lose increments or affect another project',async()=>{
  const other=await policyFixture(),before=await f.version(),otherBefore=await other.version();
  await Promise.all(f.ids.map((_,i)=>rawInsert(f,i)));expect(await f.version()).toBe(before+3);expect(await other.version()).toBe(otherBefore);
 });
 it('the tenant writer cannot spoof the transaction marker or directly update the project version',async()=>{
  await expect(withTenant(f.ctx,tx=>tx.query('UPDATE project SET policy_version_txid=pg_current_xact_id() WHERE id=$1',[f.ctx.projectId]))).rejects.toMatchObject({code:'42501'});
  await rawInsert(f);expect(await f.version()).toBe(2);
  expect(await withPlatform(tx=>tx.query<{allowed:boolean}>("SELECT has_function_privilege('opintel_app','public.bump_entitlement_policy_version()','EXECUTE') AS allowed"))).toEqual([{allowed:false}]);
 });
});
