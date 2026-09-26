import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { PostgresTokenDeclarations } from '../src/modules/catalog/index.js';
import { Entitlement, PostgresEntitlements } from '../src/modules/entitlements/index.js';
import { ProjectId, UserId, ElementId, PoolId, Timestamp, type Result } from '../src/shared/kernel/index.js';
const unwrap = <T>(r:Result<T>):T => {if(!r.ok)throw new Error(r.error.message);return r.value;};
const ctx={projectId:ProjectId(randomUUID()),userId:UserId(randomUUID())};
const other={...ctx,projectId:ProjectId(randomUUID())};
const element=ElementId(randomUUID()), pool=PoolId(randomUUID());
const repository=new PostgresTokenDeclarations(), decisions=new PostgresEntitlements();
const decide=()=>decisions.set(ctx,unwrap(Entitlement.decide({elementId:element,poolId:pool,projectId:ctx.projectId,treatment:'tokenized',maskKind:null,setBy:{kind:'user',id:ctx.userId},setAt:Timestamp(new Date()),justification:null})));
resetDatabaseBeforeEach('company');
beforeEach(async()=>{
 await withPlatform(async tx=>{
  const [industry]=await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
  const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Declarations','eu-west-1') RETURNING id");
  for(const project of [ctx.projectId,other.projectId])await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,$4,'eu-west-1')",[project,company!.id,industry!.id,project===ctx.projectId?'Compiler project':'Other project']);
 });
 await withTenant(ctx,async tx=>{
  const [source]=await tx.query<{id:string}>("INSERT INTO data_source(project_id,name,exposed_alias,kind,credential_ref) VALUES($1,'warehouse','warehouse','postgres','secret://test/source') RETURNING id",[ctx.projectId]);
  const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id",[ctx.projectId,source!.id]);
  await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal) VALUES($1,$2,$3,'customer','text','customer','VARCHAR',1)",[element,ctx.projectId,object!.id]);
  await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Analysis')",[pool,ctx.projectId]);
 });
});
it('requires tokenDomain at entitlement time; persists declarations and protects token-breaking changes',async()=>{
 expect(await decide()).toMatchObject({ok:false,error:{message:expect.stringContaining('tokenDomain')}});
 expect(unwrap(await decisions.forElement(ctx,pool,element))).toBeNull();
 unwrap(await repository.setElement(ctx,element,{tokenDomain:'customer1',caseInsensitive:true}));
 unwrap(await decide());
 expect(await repository.setElement(ctx,element,{tokenDomain:'customer2'})).toMatchObject({ok:false,error:{code:'conflict'}});
 expect(await repository.setElement(ctx,element,{caseInsensitive:false,confirmation:'wrong'})).toMatchObject({ok:false,error:{code:'conflict'}});
 unwrap(await repository.setElement(ctx,element,{tokenDomain:'customer2',caseInsensitive:false,confirmation:'Compiler project'}));
 expect(unwrap(await new PostgresTokenDeclarations().read(ctx,element))).toEqual({tokenDomain:'customer2',caseInsensitive:false});
 unwrap(await repository.setElement(ctx,element,{tokenDomain:'customer2',caseInsensitive:false}));
 expect(await repository.setElement(ctx,element,{tokenDomain:null,confirmation:'Compiler project'})).toMatchObject({ok:false,error:{code:'validation_failed'}});
});
it('validates declarations, permits first assignment, isolates tenants, and rechecks the type at entitlement time',async()=>{
 for(const domain of ['','sentinel','bad_domain','Upper','customer\n'])expect(await repository.setElement(ctx,element,{tokenDomain:domain})).toMatchObject({ok:false});
 unwrap(await repository.setElement(ctx,element,{tokenDomain:'customer'}));unwrap(await decide());
 unwrap(await repository.setElement(ctx,element,{caseInsensitive:false})); // First explicit declaration.
 expect(await repository.read(other,element)).toMatchObject({ok:false,error:{code:'not_found'}});
 expect(await repository.setElement(other,element,{tokenDomain:'other'})).toMatchObject({ok:false,error:{code:'not_found'}});
 await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET exposed_type='INTEGER',source_type='integer' WHERE id=$1",[element]));
 expect(await decide()).toMatchObject({ok:false,error:{message:expect.stringContaining('caseInsensitive')}});
 expect(await repository.setElement(ctx,element,{caseInsensitive:true})).toMatchObject({ok:false,error:{code:'validation_failed'}});
 unwrap(await repository.setElement(ctx,element,{caseInsensitive:null,confirmation:'Compiler project'}));unwrap(await decide());
});
