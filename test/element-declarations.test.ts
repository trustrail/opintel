import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {bulkFixture,allowBulk} from './fixtures/bulk-entitlements/fixture.js';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {PostgresElementDeclarations,PostgresTemporalRepository,PostgresTokenDeclarations} from '../src/modules/catalog/index.js';
import {BulkEntitlementService,PostgresBulkEntitlements,PostgresCanonicaliserAssignments} from '../src/modules/entitlements/index.js';
import {declarationRoutes} from '../src/modules/catalog/api/declaration-routes.js';
import {bulkEntitlementRoutes} from '../src/modules/entitlements/api/bulk-routes.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {ElementDeclarations,DeclarationValues,declarationsPath,schemaDeclarationsPath,declarationOpenApiDocument} from '../src/shared/api/declarations.js';
import {BulkEntitlementBody} from '../src/shared/api/bulk-entitlements.js';
import {ok,err,DomainError,ProjectId,PoolId,type Result} from '../src/shared/kernel/index.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw new Error(r.error.message);return r.value;};
let f:Awaited<ReturnType<typeof bulkFixture>>,server:ReturnType<typeof createHttpServer>|undefined,origin:string;
let permitted:'all'|'view'|'none'='all';
const discovery={canonicalisers:vi.fn(async():Promise<Result<readonly string[]>>=>ok(['stdtext1','stdnum1','stdtime1','stddate1','custom1']))};
let repository:PostgresElementDeclarations;
const read=()=>repository.read(f.ctx,f.ids[0]!);
const save=async(patch:Partial<DeclarationValues>&{confirmation?:string})=>repository.save(f.ctx,f.ids[0]!,{...unwrap(await read()).stored,...patch});
const tokenized=()=>new BulkEntitlementService(new PostgresBulkEntitlements()).execute(f.ctx,f.pool,{...f.body,treatment:'tokenized'},randomUUID(),'declaration-test');
describe('5.22 declarations end to end',()=>{
 resetDatabaseBeforeEach('company');
 beforeEach(async()=>{f=await bulkFixture(1);repository=new PostgresElementDeclarations(discovery);discovery.canonicalisers.mockClear();permitted='all';});
 afterEach(async()=>{if(server){await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));server=undefined;}});
 async function listen(){server=createHttpServer([...declarationRoutes(repository,new PostgresTemporalRepository()),...bulkEntitlementRoutes(new BulkEntitlementService(new PostgresBulkEntitlements()))],{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async request=>{expect(['view','administer','set_entitlement']).toContain(request.permission);return {...await allowBulk.check(request),allowed:permitted==='all'||(permitted==='view'&&request.permission==='view')};}}},logger:{error:()=>{}}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');origin=`http://127.0.0.1:${address.port}`;}
 it('ISO-001/DECL-001/006: mounted bulk routes apply isolated tokenization and declarations deliberately enable sharing',async()=>{
  await withTenant(f.ctx,tx=>tx.query('UPDATE catalog_element SET token_domain=NULL WHERE id=$1',[f.ids[0]]));await listen();
  const url=origin+declarationsPath(f.ctx.projectId,f.ids[0]!);
  const initial=ElementDeclarations.parse(await (await fetch(url)).json());expect(initial.stored.tokenDomain).toBeNull();
  expect(initial.effective.tokenDomain).toMatch(/^opintelisolated[0-9a-f]{64}$/);
  const decision=await fetch(`${origin}/api/v1/pools/${f.pool}/entitlements/bulk`,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({...f.body,treatment:'tokenized'})});expect(decision.status).toBe(200);
  const assigned=await fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...initial.stored,tokenDomain:'customer1',confirmation:'Bulk project'})});expect(assigned.status).toBe(200);expect(ElementDeclarations.parse(await assigned.json()).effective.tokenDomain).toBe('customer1');
  expect(discovery.canonicalisers).toHaveBeenCalledWith(f.ctx,f.ids[0]);
  const schema=await fetch(origin+schemaDeclarationsPath(f.ctx.projectId,f.source,'public'));expect(schema.status).toBe(200);
  const timezone=await fetch(origin+schemaDeclarationsPath(f.ctx.projectId,f.source,'public'),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({sourceTimezone:'America/Toronto'})});expect(timezone.status).toBe(200);
  expect(declarationOpenApiDocument().paths['/api/v1/projects/{id}/catalog/elements/{elementId}/declarations'].put.requestBody).toBeDefined();
  permitted='none';expect((await fetch(url)).status).toBe(404);expect((await fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...initial.stored,tokenDomain:'other'})})).status).toBe(404);
  permitted='view';expect((await fetch(url)).status).toBe(200);expect((await fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...initial.stored,tokenDomain:'other'})})).status).toBe(403);
 });
 it('DECL-002: reads stored null separately from default and schema inheritance',async()=>{
  unwrap(await new PostgresTemporalRepository().setSchema(f.ctx,f.source,'public',{sourceTimezone:'America/Toronto'}));
  const data=unwrap(await read());expect(data).toMatchObject({stored:{caseInsensitive:null,canonId:null,sourceTimezone:null,epochUnit:null},schemaTimezone:'America/Toronto',effective:{caseInsensitive:true,canonId:'stdtext1',sourceTimezone:'America/Toronto',mode:'text'}});
  unwrap(await save({sourceTimezone:'America/Toronto'}));expect(unwrap(await read()).stored.sourceTimezone).toBe('America/Toronto');
 });
 it('DECL-003: first explicit default is harmless; disabling default folding and changing domain require exact confirmation across pools',async()=>{
  unwrap(await tokenized());const otherPool=PoolId(randomUUID());
  await withTenant(f.ctx,async tx=>{await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Other audience')",[otherPool,f.ctx.projectId]);await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[otherPool,f.source,f.ctx.projectId]);});
  unwrap(await new BulkEntitlementService(new PostgresBulkEntitlements()).execute(f.ctx,otherPool,{...f.body,treatment:'tokenized'},randomUUID(),'other-audience'));expect(unwrap(await read()).tokenizedEntitlements).toBe(2);
  unwrap(await new BulkEntitlementService(new PostgresBulkEntitlements()).execute(f.ctx,f.pool,{...f.body,treatment:'clear',justification:'Review approved'},randomUUID(),'clear-audience'));expect(unwrap(await read()).tokenizedEntitlements).toBe(1);
  unwrap(await save({caseInsensitive:true,canonId:'stdtext1'}));
  expect(await save({caseInsensitive:false})).toMatchObject({ok:false,error:{code:'conflict'}});
  expect(await new PostgresTokenDeclarations().setElement(f.ctx,f.ids[0]!,{caseInsensitive:false})).toMatchObject({ok:false,error:{code:'conflict'}});
  expect(await save({tokenDomain:'other',confirmation:'Bulk project '})).toMatchObject({ok:false,error:{code:'conflict'}});
  unwrap(await save({caseInsensitive:false,tokenDomain:'other',confirmation:'Bulk project'}));
  unwrap(await new PostgresCanonicaliserAssignments(discovery).assign(f.ctx,f.ids[0]!,{canonId:'stdtext1'}));
  expect(await save({tokenDomain:null})).toMatchObject({ok:false,error:{code:'conflict'}});
  unwrap(await save({tokenDomain:null,confirmation:'Bulk project'}));
  expect(unwrap(await read()).effective.tokenDomain).toMatch(/^opintelisolated[0-9a-f]{64}$/);
 });
 it('DECL-003/004: first epoch assignment changes effective tokens; explicit canonicalisers are never overridden',async()=>{
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET source_type='bigint',exposed_type='BIGINT' WHERE id=$1",[f.ids[0]]));unwrap(await tokenized());
  expect(await save({epochUnit:'seconds'})).toMatchObject({ok:false,error:{code:'conflict'}});
  expect(await new PostgresTemporalRepository().setElement(f.ctx,f.ids[0]!,{epochUnit:'seconds'})).toMatchObject({ok:false,error:{code:'conflict'}});
  unwrap(await save({canonId:'stdnum1'}));
  expect(await save({epochUnit:'seconds',confirmation:'Bulk project'})).toMatchObject({ok:false,error:{code:'validation_failed'}});
  expect(unwrap(await read()).stored).toMatchObject({canonId:'stdnum1',epochUnit:null});
  unwrap(await save({epochUnit:'seconds',canonId:'stdtime1',confirmation:'Bulk project'}));
  expect(await save({epochUnit:null,confirmation:'Bulk project'})).toMatchObject({ok:false,error:{code:'validation_failed'}});
  expect(await new PostgresTemporalRepository().setElement(f.ctx,f.ids[0]!,{epochUnit:null,confirmation:'Bulk project'})).toMatchObject({ok:false,error:{code:'validation_failed'}});
  unwrap(await save({epochUnit:null,canonId:null,confirmation:'Bulk project'}));expect(unwrap(await read()).effective.canonId).toBe('stdnum1');
 });
 it('DECL-003: equal inherited timestamp override needs no confirmation; schema changes do',async()=>{
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET source_type='timestamp',exposed_type='TIMESTAMP' WHERE id=$1",[f.ids[0]]));
  const temporal=new PostgresTemporalRepository();unwrap(await temporal.setSchema(f.ctx,f.source,'public',{sourceTimezone:'UTC'}));unwrap(await tokenized());
  unwrap(await save({sourceTimezone:'UTC'}));unwrap(await save({sourceTimezone:null}));
  expect(await temporal.setSchema(f.ctx,f.source,'public',{sourceTimezone:'America/Toronto'})).toMatchObject({ok:false,error:{code:'conflict'}});
  unwrap(await temporal.setSchema(f.ctx,f.source,'public',{sourceTimezone:'America/Toronto',confirmation:'Bulk project'}));
  expect(await temporal.setSchema(f.ctx,f.source,'public',{sourceTimezone:null,confirmation:'Bulk project'})).toMatchObject({ok:false,error:{code:'validation_failed'}});
 });
 it('DECL-005/006: invalid saves are atomic, tenant isolated and discovery failure is explicit',async()=>{
  const initial=unwrap(await read());
  for(const patch of [{tokenDomain:'sentinel'},{tokenDomain:'bad_domain'},{sourceTimezone:'+01:00'},{sourceTimezone:'Not/AZone'},{epochUnit:'seconds'},{canonId:'unknown1'},{canonId:'stdnum1'}]){
   expect(await repository.save(f.ctx,f.ids[0]!,{...initial.stored,tokenDomain:'newdomain',...patch})).toMatchObject({ok:false});expect(unwrap(await read()).stored).toEqual(initial.stored);
  }
  const foreign=await bulkFixture(1);discovery.canonicalisers.mockClear();expect(await repository.read(foreign.ctx,f.ids[0]!)).toMatchObject({ok:false,error:{code:'not_found'}});expect(discovery.canonicalisers).not.toHaveBeenCalled();
  expect(await repository.save(foreign.ctx,f.ids[0]!,{...initial.stored,tokenDomain:'other'})).toMatchObject({ok:false,error:{code:'not_found'}});
  discovery.canonicalisers.mockResolvedValueOnce(err(new DomainError('dependency_unavailable','The source has no Engine assigned.')));expect(unwrap(await read()).discoveryError).toContain('no Engine');
 });
 it('DECL-007: validation names authorized qualified elements and structured declaration fields, never foreign names',async()=>{
  await withTenant(f.ctx,tx=>tx.query('UPDATE catalog_element SET token_domain=NULL,source_type=\'timestamp\',exposed_type=\'TIMESTAMP\' WHERE id=$1',[f.ids[0]]));const foreign=await bulkFixture(1);
  const result=unwrap(await new PostgresBulkEntitlements().set(f.ctx,f.pool,BulkEntitlementBody.parse({...f.body,elementIds:[...f.ids,...foreign.ids],treatment:'tokenized'}),randomUUID(),'test'));
  expect(result).toMatchObject({status:422,body:{error:{details:{invalidElements:[{elementId:f.ids[0],qualifiedName:'warehouse.public.records.field_1',declarationFields:['sourceTimezone'],reasons:[expect.stringContaining('Explore schema')]},{elementId:foreign.ids[0],qualifiedName:'Unavailable element',declarationFields:[]}]}}}});
 });
 it('DECL-003: concurrent first decision and declaration serialize without an unconfirmed token change',async()=>{
  const [declaration,decision]=await Promise.all([save({caseInsensitive:false}),tokenized()]);expect(unwrap(decision).status).toBe(200);
  if(declaration.ok)expect(unwrap(await read()).effective.caseInsensitive).toBe(false);
  else{expect(declaration.error.code).toBe('conflict');expect(unwrap(await read()).effective.caseInsensitive).toBe(true);}
 });
 it('DECL-008: changes advance generation, effective no-ops leave tokens alone and past evidence is not edited',async()=>{
  const generation=async()=> (await withPlatform(tx=>tx.query<{generation:number}>('SELECT catalog_generation AS generation FROM project WHERE id=$1',[f.ctx.projectId])))[0]!.generation;
  const before=await generation();unwrap(await save({tokenDomain:'newdomain'}));expect(await generation()).toBe(before+1);
  const after=await generation();unwrap(await save({tokenDomain:'newdomain'}));expect(await generation()).toBe(after);
  expect(await read()).not.toEqual(await repository.read({...f.ctx,projectId:ProjectId(randomUUID())},f.ids[0]!));
 });
});
