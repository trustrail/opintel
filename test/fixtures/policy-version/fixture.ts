import { randomUUID } from 'node:crypto';
import { withTenant } from '../../../src/platform/db/scope.js';
import { BulkEntitlementService, PostgresBulkEntitlements, PostgresPolicyVersions } from '../../../src/modules/entitlements/index.js';
import { IntrospectionJob, PostgresIntrospectionStore, type CatalogSnapshot, type SourceConnector } from '../../../src/modules/sources/index.js';
import { ok, Timestamp, UuidV7IdFactory, type Result } from '../../../src/shared/kernel/index.js';
import { bulkFixture } from '../bulk-entitlements/fixture.js';
export const unwrap=<T>(result:Result<T>):T=>{if(!result.ok)throw result.error;return result.value;};
export async function policyFixture(count=3){
 const fixture=await bulkFixture(count);
 await withTenant(fixture.ctx,tx=>tx.query("UPDATE catalog_element SET ordinal=split_part(source_identifier,'_',2)::int"));
 const service=new BulkEntitlementService(new PostgresBulkEntitlements());
 return {...fixture,
  version:async()=>unwrap(await new PostgresPolicyVersions().read(fixture.ctx)),
  set:async(treatment='clear',key=randomUUID(),elementIds=fixture.ids)=>unwrap(await service.execute(fixture.ctx,fixture.pool,{...fixture.body,elementIds,treatment,justification:'Reporting approval'},key,'policy-version-test')),
  introspect:async(sourceType='text',extra:string[]=[])=>{
   const snapshot:CatalogSnapshot={takenAt:Timestamp(new Date('2099-01-01T00:00:00Z')),foreignKeys:[],objects:[{schema:'public',name:'records',kind:'table',rowEstimate:0,columns:[...fixture.ids.map((_,i)=>`field_${i+1}`),...extra].map((sourceIdentifier,i)=>({sourceIdentifier,sourceType,ordinal:i+1,stableRef:null,nullable:true,isKey:false,description:null}))}]};
   const connector:SourceConnector={kind:'postgres',testConnection:async()=>ok(undefined),introspect:async()=>ok(snapshot),sampleTopValues:async()=>ok(new Map()),estimateRowCount:async()=>ok(null)};
   const job=new IntrospectionJob(new PostgresIntrospectionStore(new UuidV7IdFactory()),()=>connector);
   const queued=unwrap(await job.enqueue(fixture.ctx,fixture.source));return unwrap(await job.execute(fixture.ctx,queued.id));
  },
 };
}
export type PolicyFixture=Awaited<ReturnType<typeof policyFixture>>;
