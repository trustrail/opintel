import { randomUUID } from 'node:crypto';
import { beforeEach, describe, it, expect } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { Entitlement, PostgresEntitlements, treatments, type Treatment, type MaskKind } from '../src/modules/entitlements/index.js';
import { PostgresSourceRegistrationRepository } from '../src/modules/sources/infrastructure/source-registration-repository.js';
import { ProjectId, UserId, PoolId, ElementId, SourceId, Timestamp, type Result } from '../src/shared/kernel/index.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw new Error(r.error.message);return r.value;};
const ctx={projectId:ProjectId(randomUUID()),userId:UserId(randomUUID())};
const other={...ctx,projectId:ProjectId(randomUUID())};
const source=SourceId(randomUUID()),element=ElementId(randomUUID()),pool=PoolId(randomUUID()),second=PoolId(randomUUID());
const repository=new PostgresEntitlements();
const sources=new PostgresSourceRegistrationRepository();
const decision=(treatment:Treatment='masked',poolId=pool)=>Entitlement.decide({poolId,elementId:element,projectId:ctx.projectId,treatment,maskKind:treatment==='masked'?'all':null,setBy:{kind:'user',id:ctx.userId},setAt:Timestamp(new Date()),justification:null});
const list=async()=>unwrap(await sources.list(ctx,null,100));
describe('entitlement domain and persisted decisions',()=>{
 resetDatabaseBeforeEach('company');
 beforeEach(async()=>{
  await withPlatform(async tx=>{
   const [industry]=await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
   const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Entitlements','eu-west-1') RETURNING id");
   for(const project of [ctx.projectId,other.projectId])await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,$4,'eu-west-1')",[project,company!.id,industry!.id,project===ctx.projectId?'Decisions':'Other decisions']);
  });
  await withTenant(ctx,async tx=>{
   await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,'Warehouse','warehouse','postgres','secret://test/source','connected')",[source,ctx.projectId]);
   const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id",[ctx.projectId,source]);
   await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,token_domain) VALUES($1,$2,$3,'quantity','integer','quantity','INTEGER','quantity')",[element,ctx.projectId,object!.id]);
  });
 });
 it('H-001/H-004: native columns start absent, count undecided with no pools and remain absent from pool decisions',async()=>{
  expect(await list()).toMatchObject([{elementCount:1,undecidedCount:1}]);
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]));
  expect(unwrap(await repository.forElement(ctx,pool,element))).toBeNull();
  expect(unwrap(await repository.forPool(ctx,pool)).size).toBe(0);
  expect(await withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement'))).toEqual([]);
 });
 it('counts an element once if any pool is undecided and retains decisions when its source is archived',async()=>{
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$3,'First'),($2,$3,'Second')",[pool,second,ctx.projectId]));
  unwrap(await repository.set(ctx,unwrap(decision())));
  expect(await list()).toMatchObject([{undecidedCount:1}]);
  unwrap(await repository.set(ctx,unwrap(decision('withheld',second))));
  expect(await list()).toMatchObject([{undecidedCount:0}]);
  expect(unwrap(await repository.forPool(ctx,pool))).toEqual(new Map([[element,'masked']]));
  unwrap(await sources.archive(ctx,source,'Warehouse'));
  expect(unwrap(await repository.forPool(ctx,pool)).size).toBe(0);
  expect(await withTenant(ctx,tx=>tx.query('SELECT treatment FROM entitlement ORDER BY treatment'))).toEqual([{treatment:'masked'},{treatment:'withheld'}]);
  expect(await repository.set(ctx,unwrap(decision()))).toMatchObject({ok:false,error:{code:'not_found'}});
 });
 it('H-009: rejects undecided in the domain and database; accepts exactly the five treatments',async()=>{
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]));
  expect(decision('undecided' as Treatment)).toMatchObject({ok:false,error:{code:'validation_failed'}});
  for(const treatment of treatments){unwrap(await repository.set(ctx,unwrap(decision(treatment))));expect(unwrap(await repository.forElement(ctx,pool,element))).toBe(treatment);}
  await expect(withTenant(ctx,tx=>tx.query("UPDATE entitlement SET treatment='undecided'"))).rejects.toMatchObject({code:'23514'});
  expect(unwrap(await repository.forElement(ctx,pool,element))).toBe('withheld');
 });
 it('H-002/H-007: decision writes check the current element type and round-trip mask configuration and provenance',async()=>{
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]));
  const at=Timestamp(new Date('2026-09-21T10:00:00.000Z'));
  for(const [kind,type,allowed] of [['last4','VARCHAR',true],['email','VARCHAR',true],['year','DATE',true],['year','TIMESTAMP',true],['year','TIMESTAMPTZ',true],['all','INTEGER',true],['last4','INTEGER',false],['email','DATE',false],['year','VARCHAR',false]] as const){
   await withTenant(ctx,tx=>tx.query('UPDATE catalog_element SET exposed_type=$2 WHERE id=$1',[element,type]));
   const value=unwrap(Entitlement.decide({...unwrap(decision()).state,setAt:at,maskKind:kind}));
   const before=await withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement'));
   const result=await repository.set(ctx,value);expect(result.ok).toBe(allowed);
   if(allowed)expect(unwrap(await repository.read(ctx,pool,element))?.state).toEqual(value.state);
   else expect(await withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement'))).toEqual(before);
  }
  const clear=unwrap(decision('clear'));
  unwrap(await repository.set(ctx,clear));
  expect(unwrap(await repository.read(ctx,pool,element))?.state).toEqual(clear.state);
  expect(unwrap(await repository.read(ctx,pool,element))?.state.maskKind).toBeNull();
 });
 it('requires mask kind exactly for masked in both domain and database',async()=>{
  for(const [treatment,maskKind] of [['masked',null],['clear','all'],['withheld','year'],['masked','invalid']] as const){
   expect(Entitlement.decide({...unwrap(decision()).state,treatment,maskKind:maskKind as MaskKind|null})).toMatchObject({ok:false,error:{code:'validation_failed'}});
  }
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]));
  unwrap(await repository.set(ctx,unwrap(decision())));
  for(const [treatment,kind] of [['masked',null],['clear','all'],['masked','invalid']])await expect(withTenant(ctx,tx=>tx.query('UPDATE entitlement SET treatment=$1,mask_kind=$2',[treatment,kind]))).rejects.toMatchObject({code:'23514'});
 });
 it('isolates reads and writes and rejects cross-project pool/element foreign keys',async()=>{
  await withTenant(ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]));
  unwrap(await repository.set(ctx,unwrap(decision())));
  expect(unwrap(await repository.forPool(other,pool)).size).toBe(0);
  expect(await repository.set(other,unwrap(decision()))).toMatchObject({ok:false,error:{code:'forbidden'}});
  await expect(withTenant(other,tx=>tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[pool,element,ctx.projectId,ctx.userId]))).rejects.toMatchObject({code:'42501'});
  // Use a distinct pair so uniqueness cannot mask the composite FK check.
  const foreignPool=PoolId(randomUUID());
  await withTenant(other,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Other reporting')",[foreignPool,other.projectId]));
  await expect(withTenant(other,tx=>tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[foreignPool,element,other.projectId,ctx.userId]))).rejects.toMatchObject({code:'23503'});
  await expect(withTenant(ctx,tx=>tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[foreignPool,element,ctx.projectId,ctx.userId]))).rejects.toMatchObject({code:'23503'});
  expect(await withTenant(other,tx=>tx.query("UPDATE entitlement SET treatment='clear' RETURNING *"))).toEqual([]);
 });
});
