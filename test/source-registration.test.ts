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
import { IntrospectionJob,SidecarSourceConnector,loadSidecarClientOptions } from '../src/modules/sources/index.js';
import { createSidecarServer } from '../sidecar/http/server.js';
import { createPostgresConnector } from '../sidecar/create-postgres-connector.js';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { DevelopmentVaultAdapter } from '../src/platform/vault/index.js';
import { ProjectId,UserId,SourceId,Timestamp,UuidV7IdFactory,ok,err,DomainError } from '../src/shared/kernel/index.js';
import type { AuthorizationPort } from '../src/modules/authz/index.js';
import { sourceOpenApiDocument } from '../src/shared/api/source-schemas.js';
const exec=promisify(execFile);
let directory:string;let host:ReturnType<typeof createSidecarServer>;let api:ReturnType<typeof createHttpServer>;let service:SourceRegistrationService;
let repository:PostgresSourceRegistrationRepository;let provisionDemo=false;let provisionFailure:DomainError|Error|undefined;
let origin:string;let industryId:string;let denied=false;let projectId=ProjectId(randomUUID());const userId=UserId(randomUUID());
const templateId='31100000-0000-4000-8000-000000000001';
const suffix=randomUUID().replaceAll('-','');const schema='source_'+suffix;const landed='landed_'+suffix;const role='read_'+suffix;const password=randomUUID();
let options:Awaited<ReturnType<typeof loadSidecarClientOptions>>;
const connectors:SidecarSourceConnector[]=[];
async function customer<T>(fn:(db:Client)=>Promise<T>){const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();try{return await fn(db);}finally{await db.end();}}
const body=(name='Warehouse',receivesLandings=false)=>({name,kind:'postgres',credentialRef:'vault://test/readonly',includeSchemas:[receivesLandings?landed:schema],samplingConsent:false,receivesLandings,landingStrategy:receivesLandings?'append_as_at':null});
async function request(path:string,method='GET',payload?:unknown){return fetch(origin+path,{method,headers:payload?{'content-type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});}
const path=()=>`/api/v1/projects/${projectId}/sources`;
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'source-registration-'));await prepareSidecarDevelopment(directory);
 await customer(async db=>{await db.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}';CREATE SCHEMA "${schema}";CREATE SCHEMA "${landed}";CREATE TABLE "${schema}".records(id int,label text);CREATE TABLE "${landed}".filings(amount numeric,_opintel_filing_id uuid,_opintel_as_at date);GRANT USAGE ON SCHEMA "${schema}","${landed}" TO "${role}";GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}","${landed}" TO "${role}"`);});
 const url=new URL(process.env.TEST_DATABASE_URL!);url.username=role;url.password=password;
 const {config,tls}=await loadSidecarConfig(join(directory,'service.json'));
 host=createSidecarServer({demo:{provision:async()=>{if(provisionFailure instanceof Error)throw provisionFailure;return provisionFailure?err(provisionFailure):ok({credentialRef:'vault://test/readonly',database:'prepared_demo'});}},config:{...config,port:0},tls,connector:createPostgresConnector({vault:new DevelopmentVaultAdapter({OPINTEL_SECRET_TEST_READONLY:url.toString()}),audit:{record:async()=>{}},limits:config.limits})});
 const port=await host.listen();options={...await loadSidecarClientOptions(join(directory,'client.json')),baseUrl:`https://127.0.0.1:${port}`};
},30000);
afterAll(async()=>{await host?.close();await customer(async db=>{await db.query(`DROP SCHEMA "${schema}" CASCADE;DROP SCHEMA "${landed}" CASCADE;DROP ROLE "${role}"`);});await rm(directory,{recursive:true,force:true});});
afterEach(async()=>{await service?.close();if(api)await new Promise<void>(resolve=>api.close(()=>resolve()));});
describe('source registration against real Postgres and the sidecar',()=>{
 resetDatabaseBeforeEach('company','industry');
 beforeEach(async()=>{
  denied=false;provisionDemo=false;provisionFailure=undefined;projectId=ProjectId(randomUUID());connectors.length=0;
  await withPlatform(async tx=>{const [industry]=await tx.query<{id:string}>("SELECT id FROM industry WHERE slug='reinsurance-treaty'");industryId=industry!.id;const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Sources','eu-west-1') RETURNING id");await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,'Sources','eu-west-1')",[projectId,company!.id,industryId]);});
  const ids=new UuidV7IdFactory();const store=new PostgresIntrospectionStore(ids);
  const factory=(ctx:{projectId:ProjectId},id:SourceId)=>{const port=new SidecarSourceConnector('postgres',{projectId:ctx.projectId,sourceId:id,requestId:randomUUID(),sampling:async()=>ok({consentGiven:false,elements:[]})},options);vi.spyOn(port,'testConnection');vi.spyOn(port,'introspect');if(provisionDemo)vi.spyOn(port,'provisionDemo').mockImplementation(async(ref)=>{expect(await withTenant({projectId,userId},tx=>tx.query('SELECT id FROM data_source'))).toHaveLength(1);return ok({credentialRef:ref,database:'prepared_demo'});});connectors.push(port);return port;};
  const jobs=new IntrospectionJob(store,source=>factory(source,source.id));
  repository=new PostgresSourceRegistrationRepository();service=new SourceRegistrationService(repository,ids,factory,jobs,async(ctx,id,message)=>{await store.advance(ctx,id,'queued','connecting');await store.fail(ctx,id,message,false);});
  const unexpected=async():Promise<never>=>{throw new Error('Unexpected auth call');};
  const authorization:AuthorizationPort={check:async request=>({allowed:request.permission==='view'||!denied,token:'test' as import('../src/modules/authz/index.js').ZedToken,checkedAt:Timestamp(new Date()),snapshotAgeMs:0}),checkMany:unexpected,write:unexpected,explain:unexpected};
  api=createHttpServer(sourceRoutes(service),{authorization:{port:authorization,currentUser:async()=>({id:userId,email:'source@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}}});api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error();origin=`http://127.0.0.1:${address.port}`;
 });
 it('F-001: tests without saving, then saves and queues the selected schemas through the real connector port',async()=>{
  const tested=await request(path()+'/test','POST',{kind:'postgres',credentialRef:body().credentialRef});expect(tested.status).toBe(200);expect(await tested.json()).toMatchObject({reachable:true,schemas:expect.arrayContaining([schema,landed])});
  expect((await (await request(path())).json()).items).toEqual([]);
  const created=await request(path(),'POST',body());expect(created.status).toBe(201);const source=await created.json();expect(source).toMatchObject({origin:'customer',elementCount:0,filingCount:null});expect(source).not.toHaveProperty('credentialRef');
  await service.idle();const rows=await withTenant({projectId,userId},tx=>tx.query<{state:string;include_schemas:string[]}>('SELECT state,include_schemas FROM introspection_run'));expect(rows).toEqual([{state:'complete',include_schemas:[schema]}]);
  const listed=await (await request(path())).json();expect(listed.items).toEqual([expect.objectContaining({id:source.id,elementCount:2,undecidedCount:2,status:'connected'})]);
  expect(connectors.some(port=>vi.mocked(port.introspect).mock.calls.some(call=>call[1][0]===schema))).toBe(true);
  expect((await request(path(),'POST',body())).status).toBe(409);
 });
 it('F-004: connects ordinary and landed Postgres sources and catalogues them independently',async()=>{
  expect((await request(path(),'POST',body())).status).toBe(201);expect((await request(path(),'POST',body('Returns',true))).status).toBe(201);await service.idle();
  const listed=await (await request(path())).json();expect(listed.items).toEqual(expect.arrayContaining([expect.objectContaining({name:'Warehouse',elementCount:2,landingStrategy:null}),expect.objectContaining({name:'Returns',elementCount:3,landingStrategy:'append_as_at',filingCount:0})]));
  const first=await (await request(path()+'?limit=1')).json();expect(first.nextCursor).toBeTruthy();const second=await(await request(path()+'?cursor='+first.nextCursor)).json();expect(second.items).toHaveLength(1);expect(second.items[0].id).not.toBe(first.items[0].id);
 });
 it('F-007: bind_source denial prevents testing, saving and demo provisioning',async()=>{denied=true;for(const [suffix,payload]of [['',body()],['/test',{kind:'postgres',credentialRef:body().credentialRef}],['/from-demo',{demoTemplateId:templateId}]] as const)expect((await request(path()+suffix,'POST',payload)).status).toBe(403);expect(connectors).toHaveLength(0);});
 it('refuses literal credentials and missing landing strategies at the API boundary',async()=>{expect((await request(path(),'POST',{...body(),credentialRef:'postgres://secret'})).status).toBe(400);expect((await request(path(),'POST',{...body(),receivesLandings:true})).status).toBe(400);expect(connectors).toHaveLength(0);});
 it('E2-013/O-002: an unprepared offer creates nothing, and operator preparation reserves without connecting',async()=>{
  const url=`/api/v1/industries/${industryId}/demo-sources?projectId=${projectId}`;
  expect(await (await request(url)).json()).toEqual([expect.objectContaining({prepared:false,connected:false})]);
  const rejected=await request(path()+'/from-demo','POST',{demoTemplateId:templateId});expect(rejected.status).toBe(503);expect((await rejected.json()).error.code).toBe('dependency_unavailable');
  const reserved=randomUUID();const config=join(directory,'prepared','service.json');
  const other=new URL(process.env.TEST_DATABASE_URL!);other.pathname+='_unused';
  await exec(process.execPath,['--import','tsx','scripts/demo-pack.ts','prepare',projectId,userId,reserved],{env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,TEST_DATABASE_URL:other.toString(),SIDECAR_CONFIG_FILE:config},timeout:20000});
  expect((await(await request(path())).json()).items).toEqual([]);expect(await (await request(url)).json()).toEqual([expect.objectContaining({prepared:true,connected:false})]);
  const [row]=await withPlatform(tx=>tx.query<{deployment_ref:Record<string,{sourceId:string}>}>('SELECT deployment_ref FROM demo_source_template WHERE id=$1',[templateId]));expect(row!.deployment_ref[projectId]!.sourceId).toBe(reserved);
  expect(connectors).toHaveLength(0);
 },25000);
 it('Connect inserts the reserved demo source and uses the same connector port for introspection',async()=>{
  const reserved=randomUUID();provisionDemo=true;
  await withPlatformAdmin({actor:{kind:'system',name:'demo-deployment-fixture'}},tx=>tx.query('UPDATE demo_source_template SET deployment_ref=$2 WHERE id=$1',[templateId,JSON.stringify({[projectId]:{sourceId:reserved,credentialRef:'vault://test/readonly',landingZone:'/operator/zone',sourceName:schema}})]));
  vi.spyOn(repository,'settledFilings').mockResolvedValue(13);
  expect((await(await request(path())).json()).items).toEqual([]);
  const response=await request(path()+'/from-demo','POST',{demoTemplateId:templateId});expect(response.status).toBe(201);expect(await response.json()).toMatchObject({id:reserved,origin:'demo'});
  await service.idle();expect((await(await request(path())).json()).items).toEqual([expect.objectContaining({id:reserved,origin:'demo',elementCount:2,status:'connected'})]);
  expect(connectors.some(port=>vi.isMockFunction(port.provisionDemo)&&vi.mocked(port.provisionDemo).mock.calls.length===1)).toBe(true);
  expect(connectors.some(port=>vi.mocked(port.introspect).mock.calls.some(call=>call[1][0]===schema))).toBe(true);
 });
 it.each([false,true])('persists the exact safe provisioning message and exposes it in the source response (unexpected=%s)',async(unexpected)=>{
  const reserved=randomUUID();
  provisionFailure=unexpected?new Error('SELECT password FROM credentials: SECRET'):new DomainError('conflict',sourceMessages.templateConflict);
  await withPlatformAdmin({actor:{kind:'system',name:'demo-deployment-fixture'}},tx=>tx.query('UPDATE demo_source_template SET deployment_ref=$2 WHERE id=$1',[templateId,JSON.stringify({[projectId]:{sourceId:reserved,credentialRef:'vault://test/readonly',landingZone:'/operator/zone',sourceName:schema}})]));
  expect((await request(path()+'/from-demo','POST',{demoTemplateId:templateId})).status).toBe(201);
  const result=await service.idle();expect(result).toMatchObject({ok:false,error:{code:unexpected?'dependency_unavailable':'conflict'}});
  const listed=await(await request(path())).json();
  const expected=unexpected?'A source dependency is unavailable. Check the sidecar, Vault configuration and receipt listener, then retry.':sourceMessages.templateConflict;
  expect(listed.items[0]).toMatchObject({id:reserved,status:'introspection_failed',error:expected});
  expect(await withTenant({projectId,userId},tx=>tx.query('SELECT error FROM introspection_run'))).toEqual([{error:expected}]);
  expect(JSON.stringify(listed)).not.toMatch(/SELECT|password|SECRET/);
 });
 it('G-017 recovery: re-runs an existing source with its schema selection and preserves run history',async()=>{
  const source=await(await request(path(),'POST',body())).json();await service.idle();
  const retryPath=`/api/v1/sources/${source.id}/introspect`;
  denied=true;expect((await request(retryPath,'POST',{projectId})).status).toBe(403);denied=false;
  expect((await request(retryPath,'POST',{projectId:randomUUID()})).status).toBe(404);
  expect((await request(retryPath,'POST',{projectId,includeSchemas:['other']})).status).toBe(400);
  const pause=vi.spyOn(service,'resume').mockResolvedValue(undefined);
  const responses=await Promise.all([request(retryPath,'POST',{projectId}),request(retryPath,'POST',{projectId})]);
  expect(responses.map(r=>r.status).sort()).toEqual([202,409]);
  const queued=await responses.find(r=>r.status===202)!.json();expect(queued).toMatchObject({id:source.id,status:'pending',error:null});
  pause.mockRestore();await service.resume({projectId,userId});await service.idle();
  const runs=await withTenant({projectId,userId},tx=>tx.query('SELECT state,include_schemas,diff FROM introspection_run ORDER BY created_at,id'));
  expect(runs).toHaveLength(2);expect(runs[1]).toMatchObject({state:'complete',include_schemas:[schema],diff:[]});
  expect((await(await request(path())).json()).items).toHaveLength(1);
 });
 it.each(['connect','retry'] as const)('resumes failed demo provisioning through %s without replacing identity or history',async(entry)=>{
  const reserved=randomUUID();provisionFailure=new DomainError('conflict',sourceMessages.templateConflict);
  await withPlatformAdmin({actor:{kind:'system',name:'demo-deployment-fixture'}},tx=>tx.query('UPDATE demo_source_template SET deployment_ref=$2 WHERE id=$1',[templateId,JSON.stringify({[projectId]:{sourceId:reserved,credentialRef:'vault://test/readonly',landingZone:'/operator/zone',sourceName:schema}})]));
  expect((await request(path()+'/from-demo','POST',{demoTemplateId:templateId})).status).toBe(201);expect((await service.idle()).ok).toBe(false);
  const before=await withTenant({projectId,userId},tx=>tx.query('SELECT id,state,error FROM introspection_run'));
  const filingId=randomUUID();const payload={filingId,sourceId:reserved,projectId,revision:1,outcome:'quarantined',quarantineCategory:'merged_header',receivedAt:new Date().toISOString(),fileSha256:'0'.repeat(64),partyCode:null,period:null,kind:null};
  await withTenant({projectId,userId},tx=>tx.query('INSERT INTO arrival_notice(filing_id,project_id,source_id,revision,payload) VALUES($1,$2,$3,1,$4)',[filingId,projectId,reserved,JSON.stringify(payload)]));
  provisionFailure=undefined;vi.spyOn(repository,'settledFilings').mockResolvedValue(13);
  const pause=vi.spyOn(service,'resume').mockResolvedValue(undefined);
  const response=await request(entry==='connect'?path()+'/from-demo':`/api/v1/sources/${reserved}/introspect`,'POST',entry==='connect'?{demoTemplateId:templateId}:{projectId});
  expect(response.status).toBe(202);expect(await response.json()).toMatchObject({id:reserved,status:'pending',error:null});
  expect((await request(path()+'/from-demo','POST',{demoTemplateId:templateId})).status).toBe(202);
  pause.mockRestore();await service.resume({projectId,userId});expect(await service.idle()).toEqual({ok:true,value:undefined});
  const rows=await withTenant({projectId,userId},async tx=>({sources:await tx.query('SELECT id FROM data_source'),runs:await tx.query('SELECT id,state,error FROM introspection_run ORDER BY created_at,id'),arrivals:await tx.query('SELECT payload FROM arrival_notice')}));
  expect(rows.sources).toEqual([{id:reserved}]);expect(rows.runs).toHaveLength(2);expect(rows.runs[0]).toEqual(before[0]);expect(rows.runs[1]).toMatchObject({state:'complete',error:null});expect(rows.arrivals).toEqual([{payload}]);
  expect((await request(path()+'/from-demo','POST',{demoTemplateId:templateId})).status).toBe(200);expect(await service.idle()).toEqual({ok:true,value:undefined});
  expect(await withTenant({projectId,userId},tx=>tx.query('SELECT id FROM introspection_run'))).toHaveLength(2);
 });
 it('ING-27/29: source filing counts include landed arrivals only',async()=>{
  const source=await(await request(path(),'POST',body('Landing',true))).json();await service.idle();
  await withTenant({projectId,userId},async tx=>{
   for(const outcome of ['landed','quarantined','pending','duplicate']){
    const filingId=randomUUID();const payload={filingId,sourceId:source.id,projectId,revision:1,outcome,quarantineCategory:outcome==='quarantined'?'no_rule_matched':null,receivedAt:new Date().toISOString(),fileSha256:'0'.repeat(64),partyCode:null,period:null,kind:null};
    await tx.query('INSERT INTO arrival_notice(filing_id,project_id,source_id,revision,payload) VALUES($1,$2,$3,1,$4)',[filingId,projectId,source.id,JSON.stringify(payload)]);
   }
  });
  expect((await(await request(path())).json()).items[0]).toMatchObject({id:source.id,filingCount:1});
 });
 it('generates the source OpenAPI contract from the boundary schemas',()=>{expect(sourceOpenApiDocument().paths['/api/v1/projects/{id}/sources'].post.responses).toHaveProperty('201');});
 it('runs deployment metadata migration up/down/up on a populated table',async()=>{await customer(async db=>{await db.query('BEGIN');try{const namespace='migration_'+randomUUID().replaceAll('-','');await db.query(`CREATE SCHEMA "${namespace}";SET LOCAL search_path TO "${namespace}";CREATE TABLE demo_source_template(id int);INSERT INTO demo_source_template VALUES(1)`);const up=await readFile('migrations/025_demo_deployment.up.sql','utf8');const down=await readFile('migrations/025_demo_deployment.down.sql','utf8');await db.query(up);expect((await db.query('SELECT deployment_ref FROM demo_source_template')).rows).toEqual([{deployment_ref:{}}]);await db.query(down);await db.query(up);}finally{await db.query('ROLLBACK');}});});
});
