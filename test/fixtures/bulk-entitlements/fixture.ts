import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { withPlatform, withTenant } from '../../../src/platform/db/scope.js';
import { ProjectId, UserId, PoolId, ElementId, SourceId, Timestamp } from '../../../src/shared/kernel/index.js';
import { BulkEntitlementService, PostgresBulkEntitlements } from '../../../src/modules/entitlements/index.js';
import { bulkEntitlementRoutes } from '../../../src/modules/entitlements/api/bulk-routes.js';
import { createHttpServer } from '../../../src/platform/http/index.js';
import type { AuthorizationPort, AuthorizationRevision } from '../../../src/modules/authz/index.js';
import type { CurrentUser } from '../../../src/modules/identity/application/current-user.js';

export async function bulkFixture(count = 3) {
  const ctx={projectId:ProjectId(randomUUID()),userId:UserId(randomUUID())};
  const pool=PoolId(randomUUID()),source=SourceId(randomUUID()),ids=Array.from({length:count},()=>ElementId(randomUUID()));
  await withPlatform(async tx=>{
    const [industry]=await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
    const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Bulk tests','eu-west-1') RETURNING id");
    await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,'Bulk project','eu-west-1')",[ctx.projectId,company!.id,industry!.id]);
  });
  await withTenant(ctx,async tx=>{
    await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Bulk pool')",[pool,ctx.projectId]);
    await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,'Warehouse','warehouse','postgres','secret://test/source','connected')",[source,ctx.projectId]);
    await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[pool,source,ctx.projectId]);
    const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id",[ctx.projectId,source]);
    await tx.query(`INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,token_domain)
      SELECT id,$2,$3,'field_'||ordinal,'text','field_'||ordinal,'VARCHAR','customer' FROM unnest($1::uuid[]) WITH ORDINALITY AS elements(id,ordinal)`,[ids,ctx.projectId,object!.id]);
  });
  const actor:CurrentUser={id:ctx.userId,email:'bulk@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true};
  const body={projectId:ctx.projectId,elementIds:ids,treatment:'withheld' as const};
  return {ctx,pool,source,ids,actor,body};
}
export type BulkFixture = Awaited<ReturnType<typeof bulkFixture>>;
export const allowBulk:AuthorizationPort={
  check:async()=>({allowed:true,token:'bulk-test' as AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0}),
  checkMany:async()=>{throw new Error('Unexpected checkMany');},write:async()=>{throw new Error('Unexpected write');},explain:async()=>{throw new Error('Unexpected explain');},
};
export async function bulkServer(fixture:BulkFixture,authorization:AuthorizationPort=allowBulk,actor:CurrentUser|null=fixture.actor) {
  const service=new BulkEntitlementService(new PostgresBulkEntitlements());
  const server=createHttpServer(bulkEntitlementRoutes(service),{authorization:{currentUser:async()=>actor,port:authorization},logger:{error:()=>{}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener.');
  const url=`http://127.0.0.1:${address.port}/api/v1/pools/${fixture.pool}/entitlements/bulk`;
  return {server,url,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())),post:(body:unknown=fixture.body,key:string|undefined=randomUUID())=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(key===undefined?{}:{'Idempotency-Key':key})},body:JSON.stringify(body)})};
}
