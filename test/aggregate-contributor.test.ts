import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {bulkFixture,type BulkFixture} from './fixtures/bulk-entitlements/fixture.js';
import {withTenant} from '../src/platform/db/scope.js';
import {PostgresElementDeclarations} from '../src/modules/catalog/infrastructure/declarations.js';
import {BulkEntitlementService,PostgresBulkEntitlements,PostgresEntitlements,PostgresEntitlementReader,Entitlement,compileViews} from '../src/modules/entitlements/index.js';
import {Timestamp,ok} from '../src/shared/kernel/index.js';
import {fixture,unwrap} from './fixtures/view-compiler/input.js';
let f:BulkFixture;
const declarations=new PostgresElementDeclarations({canonicalisers:async()=>ok(['stdtext1'])});
const declare=async(index:number,key:boolean)=>{
 const current=unwrap(await declarations.read(f.ctx,f.ids[index]!));
 return declarations.save(f.ctx,f.ids[index]!,{...current.stored,contributorKey:key});
};
const author=()=>new BulkEntitlementService(new PostgresBulkEntitlements()).execute(f.ctx,f.pool,{projectId:f.ctx.projectId,elementIds:[f.ids[1]!],treatment:'aggregate_only',justification:'Contributor test'},randomUUID(),'contributor-test');
describe('G-09 source-authored contributor entity contract',()=>{
 resetDatabaseBeforeEach('company');
 beforeEach(async()=>{f=await bulkFixture(3,{contributorKey:false});await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET ordinal=split_part(source_identifier,'_',2)::int,exposed_type=CASE WHEN id=$1 THEN 'INTEGER' ELSE exposed_type END WHERE id=ANY($2::uuid[])",[f.ids[1],f.ids]));});
 it('rejects aggregate-only authoring with the column and missing key, before any batch writes',async()=>{
  expect(unwrap(await author())).toMatchObject({status:422,body:{error:{code:'validation_failed',details:{invalidElements:[{qualifiedName:'warehouse.public.records.field_2',reasons:[expect.stringMatching(/warehouse\.public\.records\.field_2.*Data sources → Warehouse → Explore schema → Token declarations.*Contributor entity key \(contributorKey=true\)/)]}]}}}});
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT * FROM entitlement'))).toEqual([]);
  const decision=unwrap(Entitlement.decide({projectId:f.ctx.projectId,poolId:f.pool,elementId:f.ids[1]!,treatment:'aggregate_only',maskKind:null,setBy:{kind:'user',id:f.ctx.userId},setAt:Timestamp(new Date()),justification:'Contributor test'}));
  expect(await new PostgresEntitlements().set(f.ctx,decision)).toMatchObject({ok:false,error:{code:'validation_failed',message:expect.stringMatching(/warehouse\.public\.records\.field_2.*Data sources → (Warehouse|warehouse) → Explore schema → Token declarations.*contributorKey=true/)}});
 });
 it('rejects compilation of a pre-existing decision with no key; declaration repairs it without making the key readable',async()=>{
  await withTenant(f.ctx,tx=>tx.query("INSERT INTO entitlement(project_id,pool_id,element_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'aggregate_only','user',$4)",[f.ctx.projectId,f.pool,f.ids[1],f.ctx.userId]));
  expect(await new PostgresEntitlementReader().compilation(f.ctx,f.pool)).toMatchObject({ok:false,error:{code:'validation_failed',message:expect.stringMatching(/warehouse\.public\.records\.field_2.*Data sources → (Warehouse|warehouse) → Explore schema → Token declarations.*contributorKey=true/)}});
  unwrap(await declare(0,true));const compilation=unwrap(await new PostgresEntitlementReader().compilation(f.ctx,f.pool));
  const plan=compilation.compilation.views[0]!.readPlan;
  expect(plan.contributor).toMatchObject({sourceIdentifier:'field_1',exposedType:'VARCHAR'});
  expect(plan.columns.map(c=>c.sourceIdentifier)).toEqual(['field_2']);
  expect(compilation.compilation.views[0]!.ddl).not.toContain('field_1');
 });
 it('declaration replacement is atomic, one key per object, and cannot be removed under existing aggregates',async()=>{
  unwrap(await declare(0,true));expect(unwrap(await author()).status).toBe(200);
  expect(await declare(0,false)).toMatchObject({ok:false,error:{code:'validation_failed'}});
  unwrap(await declare(2,true));
  expect(unwrap(await declarations.read(f.ctx,f.ids[0]!)).stored.contributorKey).toBe(false);
  expect(unwrap(await declarations.read(f.ctx,f.ids[2]!)).stored.contributorKey).toBe(true);
  expect((await withTenant(f.ctx,tx=>tx.query('SELECT id FROM catalog_element WHERE contributor_key'))).map(r=>r.id)).toEqual([f.ids[2]]);
 });
 it('invalid entity-key declarations do not replace the old key',async()=>{
  unwrap(await declare(0,true));await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET exposed_type='DOUBLE' WHERE id=$1",[f.ids[2]]));
  expect(await declare(2,true)).toMatchObject({ok:false,error:{code:'validation_failed'}});
  expect(unwrap(await declarations.read(f.ctx,f.ids[0]!)).stored.contributorKey).toBe(true);
 });
 it('concurrent key removal and aggregate authoring cannot leave an aggregate without its entity key',async()=>{
  unwrap(await declare(0,true));const [decision,removal]=await Promise.all([author(),declare(0,false)]);
  const hasDecision=(await withTenant(f.ctx,tx=>tx.query("SELECT element_id FROM entitlement WHERE treatment='aggregate_only'"))).length>0;
  const hasKey=(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM catalog_element WHERE contributor_key'))).length>0;
  expect(hasDecision&&!hasKey).toBe(false);
  if(unwrap(decision).status===200)expect(removal).toMatchObject({ok:false,error:{code:'validation_failed'}});else expect(removal.ok).toBe(true);
 });
 it('snapshot compilation requires explicit identity, not a primary-key flag or a distinct protected value',()=>{
  const input=fixture([{name:'claims',contributor:false,columns:[{name:'amount',type:'INTEGER',treatment:'aggregate_only'}]}]);
  expect(compileViews(input)).toMatchObject({ok:false,error:{code:'validation_failed',message:expect.stringContaining('claims.amount requires a declared source contributor key')}});
 });
});
