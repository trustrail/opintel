import { randomUUID } from 'node:crypto';
import { expect, it, beforeEach } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { bulkFixture } from './fixtures/bulk-entitlements/fixture.js';
import { withTenant, withPlatform } from '../src/platform/db/scope.js';
import { PostgresEntitlementReader, PostgresBulkEntitlements } from '../src/modules/entitlements/index.js';
import { PostgresElementDeclarations } from '../src/modules/catalog/index.js';
import { IntrospectionJob, PostgresIntrospectionStore, type CatalogSnapshot, type SourceConnector } from '../src/modules/sources/index.js';
import { ElementId, ProjectId, Timestamp, UuidV7IdFactory, ok, type Result } from '../src/shared/kernel/index.js';
import { BulkEntitlementBody } from '../src/shared/api/bulk-entitlements.js';
import { derivedTokenDomain, declaredTokenDomain } from '../src/shared/token-domain.js';
import { TokenKey, TokenizationRun, IanaZoneResolver } from '../sidecar/tokenize/index.js';
const unwrap = <T>(r:Result<T>):T => { if(!r.ok) throw new Error(r.error.message); return r.value; };
let f:Awaited<ReturnType<typeof bulkFixture>>;
resetDatabaseBeforeEach('company');
beforeEach(async()=>{ f=await bulkFixture(0); });
async function introspect(names=['first','second'],stable=true,table='records',schema='public'){
 const snapshot:CatalogSnapshot={takenAt:Timestamp(new Date()),objects:[{schema,name:table,kind:'table',rowEstimate:1,columns:names.map((sourceIdentifier,index)=>({sourceIdentifier,stableRef:stable?String(index+1):null,ordinal:index+1,sourceType:'text',nullable:true,isKey:false,description:null}))}],foreignKeys:[]};
 const connector:SourceConnector={kind:'postgres',testConnection:async()=>ok(undefined),introspect:async()=>ok(snapshot),sampleTopValues:async()=>ok(new Map()),estimateRowCount:async()=>ok(null)};
 const job=new IntrospectionJob(new PostgresIntrospectionStore(new UuidV7IdFactory()),()=>connector);
 const run=unwrap(await job.enqueue(f.ctx,f.source));expect(unwrap(await job.execute(f.ctx,run.id)).state).toBe('complete');
 return withTenant(f.ctx,tx=>tx.query<{id:ElementId;token_domain:string|null;source_identifier:string}>('SELECT id,token_domain,source_identifier FROM catalog_element WHERE status=\'active\' ORDER BY ordinal'));
}
async function decide(ids:ElementId[]){
 const result=unwrap(await new PostgresBulkEntitlements().set(f.ctx,f.pool,BulkEntitlementBody.parse({...f.body,elementIds:ids,treatment:'tokenized'}),randomUUID(),'isolated-test'));
 expect(result.status).toBe(200);
}
async function tokens(){
 const compiled=unwrap(await new PostgresEntitlementReader().compilation(f.ctx,f.pool));
 const key=unwrap(TokenKey.take(Uint8Array.from({length:32},(_,index)=>index)));
 try { const run=new TokenizationRun(key,new IanaZoneResolver());return compiled.compilation.views.flatMap(view=>view.readPlan.columns.map(column=>unwrap(run.tokenize('same value',column.token)))); }
 finally {key.dispose();}
}
it('ISO-001/002/003: undeclared domains apply, isolate equal values and stay stable across persisted introspections and carry renames',async()=>{
 const first=await introspect();expect(first).toHaveLength(2);expect(first.every(e=>e.token_domain===null)).toBe(true);
 await decide(first.map(e=>e.id));const original=await tokens();expect(original).toHaveLength(2);expect(original[0]).not.toBe(original[1]);
 // Stripping the public domain still cannot join their HMAC bodies.
 expect(original[0]!.split('_').at(-1)).not.toBe(original[1]!.split('_').at(-1));
 expect((await introspect()).map(e=>e.id)).toEqual(first.map(e=>e.id));expect(await tokens()).toEqual(original);
 expect((await introspect(['renamed','second'])).map(e=>e.id)).toEqual(first.map(e=>e.id));expect(await tokens()).toEqual(original);
 const declarations=new PostgresElementDeclarations({canonicalisers:async()=>ok(['stdtext1'])});
 const read=unwrap(await declarations.read(f.ctx,first[0]!.id));expect(read.stored.tokenDomain).toBeNull();expect(read.effective.tokenDomain).toBe(derivedTokenDomain({projectId:f.ctx.projectId,elementId:first[0]!.id}));
 expect(await declarations.save(f.ctx,first[0]!.id,{...read.stored,tokenDomain:'shared'})).toMatchObject({ok:false,error:{code:'conflict'}});
 for(const element of first)unwrap(await declarations.save(f.ctx,element.id,{...read.stored,tokenDomain:'shared',confirmation:'Bulk project'}));
 const shared=await tokens();expect(shared[0]).toBe(shared[1]);expect(shared[0]).not.toBe(original[0]);
 expect(await declarations.save(f.ctx,first[0]!.id,{...read.stored})).toMatchObject({ok:false,error:{code:'conflict'}});
 unwrap(await declarations.save(f.ctx,first[0]!.id,{...read.stored,confirmation:'Bulk project'}));expect((await tokens())[0]).toBe(original[0]);
});
it.each([
 {setting:'new',stable:true,table:'records',schema:'public'},
 {setting:'carry',stable:false,table:'records',schema:'public'},
 {setting:'carry',stable:true,table:'renamed_table',schema:'public'},
 {setting:'carry',stable:true,table:'records',schema:'renamed_schema'},
])('ISO-003: replacement changes isolated tokens and never carries old decisions ($setting/$stable/$table/$schema)',async({setting,stable,table,schema})=>{
 await withPlatform(tx=>tx.query('UPDATE project SET settings=$2::jsonb WHERE id=$1',[f.ctx.projectId,JSON.stringify({discovery:{renameHandling:setting}})]));
 const first=await introspect(['first'],stable);await decide([first[0]!.id]);const original=await tokens();
 expect((await introspect(['first'],stable))[0]!.id).toBe(first[0]!.id);expect(await tokens()).toEqual(original);
 const replaced=await introspect(['renamed'],stable,table,schema);expect(replaced[0]!.id).not.toBe(first[0]!.id);
 const missing=unwrap(await new PostgresEntitlementReader().compilation(f.ctx,f.pool));expect(missing.compilation.views).toEqual([]);
 await decide([replaced[0]!.id]);expect(await tokens()).not.toEqual(original);
});
it('ISO-002: the isolated namespace is project scoped and cannot be declared explicitly',()=>{
 const elementId=ElementId(randomUUID()),domain=derivedTokenDomain({projectId:f.ctx.projectId,elementId});
 expect(derivedTokenDomain({projectId:ProjectId(randomUUID()),elementId})).not.toBe(domain);
 expect(declaredTokenDomain.safeParse(domain).success).toBe(false);
});
