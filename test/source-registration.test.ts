import {acknowledgeDevelopmentPolicy} from '../scripts/dev-demo-readiness.js';
import {unwrap} from './fixtures/policy-version/fixture.js';
import {EngineRegistry,PostgresEngineRepository,HttpsEngineProbe,EngineEgress,PostgresEngineEgress} from '../src/modules/engines/index.js';
import type {EngineId} from '../src/shared/kernel/index.js';
import {developmentEngineOptions} from '../scripts/development-engine.js';
import { FileCustody } from '../sidecar/custody/infrastructure/file-custody.js';
import { DevelopmentFileKeyStore,DevelopmentFileKeyEscrow } from '../sidecar/custody/infrastructure/development-file-keys.js';
import { KeyCustodyService,PostgresCustodyRepository,SidecarCustodyClient } from '../src/modules/entitlements/index.js';
import { sourceMessages } from '../src/shared/source-errors.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform,withPlatformAdmin,withTenant } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { sourceRoutes } from '../src/modules/sources/api/source-routes.js';
import { SourceRegistrationService } from '../src/modules/sources/application/source-registration.js';
import { PostgresSourceRegistrationRepository } from '../src/modules/sources/infrastructure/source-registration-repository.js';
import { PostgresIntrospectionStore } from '../src/modules/sources/infrastructure/postgres-introspection-store.js';
import { IntrospectionJob,SidecarSourceConnector } from '../src/modules/sources/index.js';
import { createSidecarServer } from '../sidecar/http/server.js';
import { createPostgresConnector } from '../sidecar/create-postgres-connector.js';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { EnvironmentSecretStore } from '../src/platform/secrets/index.js';
import { ProjectId,UserId,SourceId,Timestamp,UuidV7IdFactory,ok,err,DomainError } from '../src/shared/kernel/index.js';
import type { AuthorizationPort } from '../src/modules/authz/index.js';
import { sourceOpenApiDocument } from '../src/shared/api/source-schemas.js';
const exec=promisify(execFile);
let directory:string;let host:ReturnType<typeof createSidecarServer>;let api:ReturnType<typeof createHttpServer>;let service:SourceRegistrationService;
let repository:PostgresSourceRegistrationRepository;
let origin:string;let industryId:string;let denied=false;let projectId=ProjectId(randomUUID());const userId=UserId(randomUUID());
const templateId='31100000-0000-4000-8000-000000000001';
const suffix=randomUUID().replaceAll('-','');const schema='source_'+suffix;const landed='landed_'+suffix;const role='read_'+suffix;const password=randomUUID();
let options:Awaited<ReturnType<typeof developmentEngineOptions>>;
const connectors:SidecarSourceConnector[]=[];
async function customer<T>(fn:(db:Client)=>Promise<T>){const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();try{return await fn(db);}finally{await db.end();}}
let registeredEngineId:EngineId;
const body=(name='Warehouse',receivesLandings=false)=>({engineId:registeredEngineId,name,kind:'postgres',credentialRef:'secret://test/readonly',includeSchemas:[receivesLandings?landed:schema],samplingConsent:false,receivesLandings,landingStrategy:receivesLandings?'append_as_at':null});
async function request(path:string,method='GET',payload?:unknown){return fetch(origin+path,{method,headers:payload?{'content-type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});}
const path=()=>`/api/v1/projects/${projectId}/sources`;
async function settle(){
 const heartbeat=new EngineEgress(new PostgresEngineEgress(),()=>service.resume({projectId,userId}));
 await acknowledgeDevelopmentPolicy(heartbeat,options.tls.certificatePin!,{projectId,userId},registeredEngineId);
 return service.idle();
}
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'source-registration-'));await prepareSidecarDevelopment(directory);
 await customer(async db=>{await db.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}';CREATE SCHEMA "${schema}";CREATE SCHEMA "${landed}";CREATE TABLE "${schema}".records(id int,label text);CREATE TABLE "${landed}".filings(amount numeric,_opintel_filing_id uuid,_opintel_as_at date);GRANT USAGE ON SCHEMA "${schema}","${landed}" TO "${role}";GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}","${landed}" TO "${role}"`);});
 const url=new URL(process.env.TEST_DATABASE_URL!);url.username=role;url.password=password;
 const {config,tls}=await loadSidecarConfig(join(directory,'service.json'));
 host=createSidecarServer({custody:new FileCustody(await DevelopmentFileKeyStore.open(config.custody!.keyStore),await DevelopmentFileKeyEscrow.open(config.custody!.keyEscrow)),config:{...config,port:0},tls,connector:createPostgresConnector({secrets:new EnvironmentSecretStore({OPINTEL_SECRET_TEST_READONLY:url.toString()}),audit:{record:async()=>{}},limits:config.limits})});
 const port=await host.listen();options={...await developmentEngineOptions(join(directory,'service.json')),baseUrl:`https://127.0.0.1:${port}`};
},30000);
afterAll(async()=>{await host?.close();await customer(async db=>{await db.query(`DROP SCHEMA "${schema}" CASCADE;DROP SCHEMA "${landed}" CASCADE;DROP ROLE "${role}"`);});await rm(directory,{recursive:true,force:true});});
afterEach(async()=>{await service?.close();if(api)await new Promise<void>(resolve=>api.close(()=>resolve()));});
describe('source registration against real Postgres and the sidecar',()=>{
 resetDatabaseBeforeEach('company','industry');
 beforeEach(async()=>{
  denied=false;projectId=ProjectId(randomUUID());connectors.length=0;
  await withPlatform(async tx=>{await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[userId,userId+'@source.test']);const [industry]=await tx.query<{id:string}>("SELECT id FROM industry WHERE slug='reinsurance-treaty'");industryId=industry!.id;const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Sources','eu-west-1') RETURNING id");await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,'Sources','eu-west-1')",[projectId,company!.id,industryId]);});
  const registry=new EngineRegistry(new PostgresEngineRepository(),new HttpsEngineProbe(),options.tls);registeredEngineId=unwrap(await registry.register({projectId,userId},{name:'Fixture engine',address:options.baseUrl,certificatePin:options.tls.certificatePin!})).id;unwrap(await registry.verify({projectId,userId},registeredEngineId));
  const ids=new UuidV7IdFactory();const store=new PostgresIntrospectionStore(ids);
  const factory=(ctx:{projectId:ProjectId},id:SourceId)=>{const port=new SidecarSourceConnector('postgres',{projectId:ctx.projectId,sourceId:id,requestId:randomUUID(),sampling:async()=>ok({consentGiven:false,elements:[]})},options);vi.spyOn(port,'testConnection');vi.spyOn(port,'introspect');connectors.push(port);return port;};
  const jobs=new IntrospectionJob(store,source=>factory(source,source.id));
  repository=new PostgresSourceRegistrationRepository();service=new SourceRegistrationService(repository,ids,factory,jobs,async(ctx,id,message)=>{await store.advance(ctx,id,'queued','connecting');await store.fail(ctx,id,message,false);},undefined,new KeyCustodyService(new PostgresCustodyRepository(),new SidecarCustodyClient(options),{checkMany:async()=>[]}));
  const unexpected=async():Promise<never>=>{throw new Error('Unexpected auth call');};
  const authorization:AuthorizationPort={check:async request=>({allowed:request.permission==='view'||!denied,token:'test' as import('../src/modules/authz/index.js').AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0}),checkMany:unexpected,write:unexpected,explain:unexpected};
  api=createHttpServer(sourceRoutes(service),{authorization:{port:authorization,currentUser:async()=>({id:userId,email:'source@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error();origin=`http://127.0.0.1:${address.port}`;
 });
 it('TOK-27: an unverified backup prevents source contact',async()=>{
  const custody=vi.spyOn(SidecarCustodyClient.prototype,'call').mockResolvedValue(err(new DomainError('dependency_unavailable','Token key escrow write failed. Check the configured backup location and retry.')));
  try{const response=await request(path(),'POST',body());expect(response.status).toBe(503);expect((await response.json()).error.message).toBe('Token key escrow write failed. Check the configured backup location and retry.');expect(connectors).toHaveLength(0);
  }finally{custody.mockRestore();}
 });
 it('F-010: saving without schemas does no scan or source contact; policy-gated metadata excludes system schemas and selection scans exactly those chosen',async()=>{
  const created=await request(path(),'POST',{...body(),includeSchemas:[]});expect(created.status).toBe(201);const source=await created.json();
  expect(connectors).toHaveLength(0);expect(await withTenant({projectId,userId},tx=>tx.query('SELECT id FROM introspection_run'))).toEqual([]);
  const pending=await request(`/api/v1/sources/${source.id}/schemas?projectId=${projectId}`);expect(pending.status).toBe(409);expect(connectors).toHaveLength(0);
  await settle();expect(connectors).toHaveLength(0);expect((await(await request(path())).json()).items[0].status).toBe('choose_schemas');
  const listed=await request(`/api/v1/sources/${source.id}/schemas?projectId=${projectId}`);expect(listed.status).toBe(200);const schemas=await listed.json();expect(schemas.schemas).toContain(schema);expect(schemas.schemas).toContain(landed);expect(schemas.schemas.some((name:string)=>['pg_catalog','information_schema','pg_toast'].includes(name)||/^pg_(?:toast_)?temp/u.test(name))).toBe(false);
  expect(await withTenant({projectId,userId},tx=>tx.query('SELECT id FROM introspection_run'))).toEqual([]);
  const selected=await request(`/api/v1/sources/${source.id}/schemas`,'PUT',{projectId,includeSchemas:[schema]});expect(selected.status,await selected.clone().text()).toBe(202);await service.idle();
  expect(await withTenant({projectId,userId},tx=>tx.query('SELECT include_schemas FROM introspection_run'))).toEqual([{include_schemas:[schema]}]);expect((await(await request(path())).json()).items[0]).toMatchObject({status:'connected',includeSchemas:[schema],elementCount:2});
  const changed=await request(`/api/v1/sources/${source.id}/schemas`,'PUT',{projectId,includeSchemas:[landed]});expect(changed.status).toBe(202);await service.idle();expect(await withTenant({projectId,userId},tx=>tx.query('SELECT include_schemas FROM introspection_run ORDER BY created_at,id'))).toEqual([{include_schemas:[schema]},{include_schemas:[landed]}]);
  const empty=await request(`/api/v1/sources/${source.id}/schemas`,'PUT',{projectId,includeSchemas:[]});expect(empty.status).toBe(400);
  denied=true;expect((await request(`/api/v1/sources/${source.id}/schemas?projectId=${projectId}`)).status).toBe(403);expect((await request(`/api/v1/sources/${source.id}/schemas`,'PUT',{projectId,includeSchemas:[schema]})).status).toBe(403);
 });
 it('F-011: metadata listing failure is saved on the source, without creating a failed or automatic scan',async()=>{
  const source=await(await request(path(),'POST',{...body(),includeSchemas:[]})).json();await settle();
  const failure=vi.spyOn(SidecarSourceConnector.prototype,'listSchemas').mockResolvedValueOnce(err(new DomainError('source_unavailable','Source connection timed out.')));
  try{const result=await request(`/api/v1/sources/${source.id}/schemas?projectId=${projectId}`);expect(result.status).toBe(503);expect((await(await request(path())).json()).items[0]).toMatchObject({status:'choose_schemas',error:'Source connection timed out.'});expect(await withTenant({projectId,userId},tx=>tx.query('SELECT id FROM introspection_run'))).toEqual([]);}finally{failure.mockRestore();}
 });
 it('F-001: saves and assigns before contact, then tests and introspects after applied heartbeat',async()=>{
  const tested=await request(path()+'/test','POST',{engineId:registeredEngineId,kind:'postgres',credentialRef:body().credentialRef});expect(tested.status).toBe(200);expect(await tested.json()).toMatchObject({reachable:false,schemas:[]});expect(connectors).toHaveLength(0);
  expect((await (await request(path())).json()).items).toEqual([]);
  const created=await request(path(),'POST',body());expect(created.status).toBe(201);const source=await created.json();expect(source).toMatchObject({origin:'customer',elementCount:0,filingCount:null,status:'pending_egress'});expect(connectors).toHaveLength(0);expect(source).not.toHaveProperty('credentialRef');
  await settle();const rows=await withTenant({projectId,userId},tx=>tx.query<{state:string;include_schemas:string[]}>('SELECT state,include_schemas FROM introspection_run'));expect(rows).toEqual([{state:'complete',include_schemas:[schema]}]);
  const listed=await (await request(path())).json();expect(listed.items).toEqual([expect.objectContaining({id:source.id,elementCount:2,undecidedCount:2,status:'connected'})]);
  expect(connectors.some(port=>vi.mocked(port.introspect).mock.calls.some(call=>call[1][0]===schema))).toBe(true);
  expect((await request(path(),'POST',body())).status).toBe(409);
 });
 it('F-004: connects ordinary and landed Postgres sources and catalogues them independently',async()=>{
  expect((await request(path(),'POST',body())).status).toBe(201);expect((await request(path(),'POST',body('Returns',true))).status).toBe(201);await settle();
  const listed=await (await request(path())).json();expect(listed.items).toEqual(expect.arrayContaining([expect.objectContaining({name:'Warehouse',elementCount:2,landingStrategy:null}),expect.objectContaining({name:'Returns',elementCount:3,landingStrategy:'append_as_at',filingCount:0})]));
  const first=await (await request(path()+'?limit=1')).json();expect(first.nextCursor).toBeTruthy();const second=await(await request(path()+'?cursor='+first.nextCursor)).json();expect(second.items).toHaveLength(1);expect(second.items[0].id).not.toBe(first.items[0].id);
 });
 it('F-008: archive names dependent pools, requires exact confirmation and retains all evidence references',async()=>{
  const source=await(await request(path(),'POST',body())).json();await settle();
  const pool=randomUUID();const ctx={projectId,userId};
  await withTenant(ctx,async tx=>{
   await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,projectId]);
   await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref,mask_kind) SELECT $1,id,project_id,'masked','user',$2,'all' FROM catalog_element",[pool,userId]);
  });
  const retained=()=>withTenant(ctx,async tx=>({elements:await tx.query('SELECT * FROM catalog_element ORDER BY id'),objects:await tx.query('SELECT * FROM catalog_object ORDER BY id'),entitlements:await tx.query('SELECT * FROM entitlement ORDER BY element_id')}));
  const before=await retained();const endpoint=`/api/v1/sources/${source.id}`;
  denied=true;expect((await request(endpoint,'DELETE',{projectId})).status).toBe(403);denied=false;
  expect((await request(endpoint,'DELETE',{projectId:randomUUID()})).status).toBe(404);
  for(const confirmation of [undefined,'warehouse']){
   const refused=await request(endpoint,'DELETE',{projectId,confirmation});expect(refused.status).toBe(409);
   expect((await refused.json()).error).toMatchObject({code:'conflict',details:{confirmationPhrase:'Warehouse',entitlements:[{poolId:pool,poolName:'Reporting',count:2}]}});
  }
  expect(await retained()).toEqual(before);
  const archived=await request(endpoint,'DELETE',{projectId,confirmation:'Warehouse'});expect(archived.status).toBe(200);expect(await archived.json()).toMatchObject({status:'archived'});
  expect(await retained()).toEqual(before);expect((await(await request(path())).json()).items).toEqual([]);
  expect((await request(endpoint+'/introspect','POST',{projectId})).status).toBe(409);
  expect((await request(path(),'POST',body())).status).toBe(409);
 });
 it('F-007: bind_source denial prevents testing, saving',async()=>{denied=true;for(const [suffix,payload]of [['',body()],['/test',{engineId:registeredEngineId,kind:'postgres',credentialRef:body().credentialRef}]] as const)expect((await request(path()+suffix,'POST',payload)).status).toBe(403);expect(connectors).toHaveLength(0);});
 it('refuses literal credentials and missing landing strategies at the API boundary',async()=>{expect((await request(path(),'POST',{...body(),credentialRef:'postgres://secret'})).status).toBe(400);expect((await request(path(),'POST',{...body(),receivesLandings:true})).status).toBe(400);expect(connectors).toHaveLength(0);});
 it('G-017 recovery: re-runs an existing source with its schema selection and preserves run history',async()=>{
  const source=await(await request(path(),'POST',body())).json();await settle();
  const retryPath=`/api/v1/sources/${source.id}/introspect`;
  denied=true;expect((await request(retryPath,'POST',{projectId})).status).toBe(403);denied=false;
  expect((await request(retryPath,'POST',{projectId:randomUUID()})).status).toBe(404);
  expect((await request(retryPath,'POST',{projectId,includeSchemas:['other']})).status).toBe(400);
  const pause=vi.spyOn(service,'resume').mockResolvedValue(undefined);
  const responses=await Promise.all([request(retryPath,'POST',{projectId}),request(retryPath,'POST',{projectId})]);
  expect(responses.map(r=>r.status).sort()).toEqual([202,409]);
  const queued=await responses.find(r=>r.status===202)!.json();expect(queued).toMatchObject({id:source.id,status:'pending',error:null});
  pause.mockRestore();await service.resume({projectId,userId});await settle();
  const runs=await withTenant({projectId,userId},tx=>tx.query('SELECT state,include_schemas,diff FROM introspection_run ORDER BY created_at,id'));
  expect(runs).toHaveLength(2);expect(runs[1]).toMatchObject({state:'complete',include_schemas:[schema],diff:[]});
  expect((await(await request(path())).json()).items).toHaveLength(1);
 });
 it('ING-27/29: source filing counts include landed arrivals only',async()=>{
  const source=await(await request(path(),'POST',body('Landing',true))).json();await settle();
  await withTenant({projectId,userId},async tx=>{
   for(const outcome of ['landed','quarantined','pending','duplicate']){
    const filingId=randomUUID();const payload={filingId,sourceId:source.id,projectId,revision:1,outcome,quarantineCategory:outcome==='quarantined'?'no_rule_matched':null,receivedAt:new Date().toISOString(),fileSha256:'0'.repeat(64),partyCode:null,period:null,kind:null};
    await tx.query('INSERT INTO arrival_notice(filing_id,project_id,source_id,revision,payload) VALUES($1,$2,$3,1,$4)',[filingId,projectId,source.id,JSON.stringify(payload)]);
   }
  });
  expect((await(await request(path())).json()).items[0]).toMatchObject({id:source.id,filingCount:1});
 });
 it('removed template routes are absent from runtime and OpenAPI',async()=>{expect((await request(path()+'/from-demo','POST',{demoTemplateId:templateId})).status).toBe(404);expect((await request(`/api/v1/industries/${industryId}/demo-sources?projectId=${projectId}`)).status).toBe(404);expect(JSON.stringify(sourceOpenApiDocument())).not.toMatch(/from-demo|demo-sources/);});
 it('generates the source OpenAPI contract from the boundary schemas',()=>{expect(sourceOpenApiDocument().paths['/api/v1/projects/{id}/sources'].post.responses).toHaveProperty('201');});
 // Migration round trips are functional; this hang guard allows for growth of the migration chain.
 it('runs deployment metadata migration up/down/up on a populated table',async()=>{await customer(async db=>{await db.query('BEGIN');try{const namespace='migration_'+randomUUID().replaceAll('-','');await db.query(`CREATE SCHEMA "${namespace}";SET LOCAL search_path TO "${namespace}";CREATE TABLE demo_source_template(id int);INSERT INTO demo_source_template VALUES(1)`);const up=await readFile('migrations/025_demo_deployment.up.sql','utf8');const down=await readFile('migrations/025_demo_deployment.down.sql','utf8');await db.query(up);expect((await db.query('SELECT deployment_ref FROM demo_source_template')).rows).toEqual([{deployment_ref:{}}]);await db.query(down);await db.query(up);}finally{await db.query('ROLLBACK');}});}, 60_000);

it('Re-introspection names active runs and refuses archives without adding a run',async()=>{
 const pause=vi.spyOn(service,'resume').mockResolvedValue(undefined);
 try{
 const created=await(await request(path(),'POST',body())).json();
 const endpoint=`/api/v1/sources/${created.id}/introspect`;
 const [active]=await withTenant({projectId,userId},tx=>tx.query<{id:string}>('SELECT id FROM introspection_run WHERE source_id=$1',[created.id]));
 const refused=await request(endpoint,'POST',{projectId});expect(refused.status).toBe(409);
 const failure=await refused.json();expect(failure.error.code).toBe('conflict');expect(failure.error.details).toEqual({runId:active!.id});expect(failure.error.message).toContain(active!.id);
 await withTenant({projectId,userId},async tx=>{await tx.query("UPDATE introspection_run SET state='complete',ended_at=now() WHERE id=$1",[active!.id]);await tx.query("UPDATE data_source SET status='connected' WHERE id=$1",[created.id]);});
 expect((await request(endpoint,'POST',{projectId})).status).toBe(202);
 await withTenant({projectId,userId},tx=>tx.query("UPDATE data_source SET status='archived' WHERE id=$1",[created.id]));
 const archived=await request(endpoint,'POST',{projectId});expect(archived.status).toBe(409);expect((await archived.json()).error.message).toBe('An archived source cannot be introspected.');
 expect(await withTenant({projectId,userId},tx=>tx.query('SELECT id FROM introspection_run WHERE source_id=$1',[created.id]))).toHaveLength(2);
 }finally{pause.mockRestore();}
});

});
