import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:https';
import { Client } from 'pg';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarConfig, sidecarConfigSchema, type SidecarConfig, type SidecarTls } from '../sidecar/config.js';
import { createSidecarServer, sidecarBuild } from '../sidecar/http/server.js';
import { FileSamplingAudit } from '../sidecar/infrastructure/file-sampling-audit.js';
import { PostgresConnector } from '../sidecar/infrastructure/postgres-connector.js';
import { PostgresSourceScope, type SourceSession } from '../sidecar/infrastructure/postgres-source-scope.js';
import { DevelopmentVaultAdapter, VaultRef } from '../src/platform/vault/index.js';
import { SidecarSourceConnector, loadSidecarClientOptions, type SidecarOptions } from '../src/modules/sources/index.js';
import { ElementId, ObjectId, ProjectId, SourceId, ok } from '../src/shared/kernel/index.js';
import * as wire from '../src/shared/sidecar-contract.js';

const suffix=randomUUID().replaceAll('-','');
const schema=`sidecar_${suffix}`;
const role=`sidecar_${suffix}`;
const password=randomUUID();
const sentinel='SOURCE_ROW_SENTINEL';
const ref=VaultRef('vault://test/source');
const sourceId=SourceId(randomUUID());
const projectId=ProjectId(randomUUID());
const elementId=ElementId(randomUUID());
const body=(payload:unknown)=>({requestId:'wire-test',projectId,sourceId,credentialRef:ref,payload});
let directory:string;
let sourceUrl:string;
let config:SidecarConfig;
let tls:SidecarTls;
let options:SidecarOptions;
let audit:FileSamplingAudit;
let host:ReturnType<typeof createSidecarServer>;
let connector:PostgresConnector;
let vault:DevelopmentVaultAdapter;
let resolveSpy:MockInstance<DevelopmentVaultAdapter['resolve']>;
let alternate:{cert:string;key:string};
const queryFailures:unknown[]=[];
class ObservedScope extends PostgresSourceScope {
  override run<T>(key:string,credential:VaultRef,work:(session:SourceSession)=>Promise<T>,signal?:AbortSignal):Promise<T>{
    return super.run(key,credential,(session)=>work({query:async(sql,values)=>{
      try{return await session.query(sql,values);}catch(error:unknown){
        if(typeof error==='object'&&error!==null&&'code'in error)queryFailures.push(error.code);
        throw error;
      }
    }}),signal);
  }
}
async function fixture<T>(work:(db:Client)=>Promise<T>):Promise<T>{
  const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  try{return await work(db);}finally{await db.end();}
}
async function json(path:string,payload?:unknown,settings:{tls?:Partial<SidecarOptions['tls']>;method?:string;raw?:string;baseUrl?:string}={}):Promise<{status:number;value:unknown}>{
  return new Promise((resolve,reject)=>{
    const encoded=settings.raw??(payload===undefined?undefined:JSON.stringify(payload));
    const req=request(new URL(path,settings.baseUrl??options.baseUrl),{method:settings.method??'POST',...options.tls,...settings.tls,agent:false,minVersion:'TLSv1.3',signal:AbortSignal.timeout(3000),headers:encoded===undefined?{}:{'content-type':'application/json'}},(res)=>{
      let text='';res.on('data',(chunk:Buffer)=>{text+=chunk.toString();});res.on('error',reject);
      res.on('end',()=>{try{resolve({status:res.statusCode??0,value:JSON.parse(text) as unknown});}catch{reject(new Error('Non-JSON response'));}});
    });req.on('error',reject);req.end(encoded);
  });
}
const client=(object='records',configOptions=options)=>new SidecarSourceConnector('postgres',{
  requestId:'client-test',projectId,sourceId,sampling:async()=>ok({consentGiven:true,elements:[{elementId,schema,object,column:'label'}]}),
},configOptions);
const auditRows=async()=> (await readFile(config.auditFile,'utf8')).trim().split('\n').filter(Boolean).map((line)=>JSON.parse(line) as Record<string,unknown>);

beforeAll(async()=>{
  directory=await mkdtemp(join(tmpdir(),'opintel-http-sidecar-'));
  await prepareSidecarDevelopment(directory);
  ({config,tls}=await loadSidecarConfig(join(directory,'service.json')));
  config={...config,port:0,limits:{maxConnectionsPerSource:2,statementTimeoutMs:5000,operationTimeoutMs:6000}};
  const tlsDir=join(directory,'tls');
  const openssl=(...args:string[])=>execFileSync('openssl',args,{cwd:tlsDir,stdio:'ignore'});
  openssl('req','-newkey','rsa:2048','-nodes','-keyout','alternate.key','-out','alternate.csr','-subj','/CN=Unpinned application');
  openssl('x509','-req','-in','alternate.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','alternate.pem','-days','2','-extfile','client.ext');
  alternate={cert:await readFile(join(tlsDir,'alternate.pem'),'utf8'),key:await readFile(join(tlsDir,'alternate.key'),'utf8')};
  await fixture(async(db)=>{
    await db.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    await db.query(`CREATE SCHEMA "${schema}"; CREATE TABLE "${schema}".records(id integer PRIMARY KEY,label text);`);
    await db.query(`INSERT INTO "${schema}".records VALUES(1,$1),(2,$1),(3,'other')`,[sentinel]);
    await db.query(`ANALYZE "${schema}".records`);
    await db.query(`CREATE VIEW "${schema}".slow AS SELECT label FROM "${schema}".records WHERE pg_sleep(30) IS NOT NULL`);
    await db.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"; GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`);
    const base=process.env.TEST_DATABASE_URL;if(base===undefined)throw new Error('Missing database');
    const url=new URL(base);url.username=role;url.password=password;sourceUrl=url.toString();
  });
  vault=new DevelopmentVaultAdapter({OPINTEL_SECRET_TEST_SOURCE:sourceUrl});
  resolveSpy=vi.spyOn(vault,'resolve');
  audit=await FileSamplingAudit.open(config.auditFile);
  connector=new PostgresConnector(new ObservedScope(vault,config.limits),audit);
  host=createSidecarServer({config,tls,connector});
  const port=await host.listen();
  options={...await loadSidecarClientOptions(join(directory,'client.json')),baseUrl:`https://127.0.0.1:${port}`};
},60000);
beforeEach(()=>{resolveSpy.mockClear();queryFailures.length=0;});
afterAll(async()=>{
  if(host!==undefined)await host.close();if(audit!==undefined)await audit.close();
  await fixture(async(db)=>{await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP ROLE IF EXISTS "${role}"`);});
  if(directory!==undefined)await rm(directory,{recursive:true,force:true});
});

describe('S1 sidecar over real pinned mTLS and Postgres',()=>{
  it('J-001: all five POST endpoints implement the wire contract',async()=>{
    expect(await json('/health')).toEqual({status:200,value:sidecarBuild});
    expect(await json('/test-connection',body({}))).toEqual({status:200,value:{reachable:true}});
    const introspection=await json('/introspect',body({include:[schema]}));
    expect(introspection.status).toBe(200);expect(wire.snapshotResponse.safeParse(introspection.value).success).toBe(true);
    const sample=await json('/sample',body({consentGiven:true,elements:[{elementId,schema,object:'records',column:'label'}],limit:2}));
    expect(sample).toEqual({status:200,value:{values:{[elementId]:[{value:sentinel,frequency:2},{value:'other',frequency:1}]}}});
    expect(await json('/estimate',body({object:{schema,name:'records'}}))).toEqual({status:200,value:{rows:3}});
    const recorded=await auditRows();
    expect(recorded.slice(-2).map((entry)=>entry.outcome)).toEqual(['started','completed']);
    expect(JSON.stringify(recorded)).not.toContain(sentinel);expect(JSON.stringify(recorded)).not.toContain(password);
  });
  it('G-014/J-002: HTTP introspection equals direct connector introspection and contains structure only',async()=>{
    const via=await client().introspect(ref,[schema]);const direct=await connector.introspect(body({include:[schema]}));
    if(!via.ok||!direct.ok)throw new Error('Introspection failed');
    expect(via.value.objects).toEqual(direct.value.snapshot.objects);expect(via.value.foreignKeys).toEqual(direct.value.snapshot.foreignKeys);
    const columns=await fixture(async(db)=>(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,'records'])).rows);
    expect(via.value.objects.find((entry)=>entry.name==='records')?.columns.map((entry)=>entry.sourceIdentifier)).toEqual(columns.map((entry: {column_name:string})=>entry.column_name));
    expect(JSON.stringify(via)).not.toContain(sentinel);expect(JSON.stringify(via)).not.toContain(password);
  });
  it.each([false,undefined])('G-015: consent %s is refused with 403 before vault resolution and is audited',async(consentGiven)=>{
    const result=await json('/sample',body({consentGiven,elements:[{elementId,schema,object:'records',column:'label'}],limit:2}));
    expect(result).toMatchObject({status:403,value:{error:{code:'forbidden',requestId:'wire-test',retryable:false}}});
    expect(resolveSpy).not.toHaveBeenCalled();expect((await auditRows()).at(-1)).toMatchObject({outcome:'refused',consentGiven:false});
  });
  it('rejects missing and CA-trusted but unpinned client certificates',async()=>{
    await expect(json('/health',undefined,{tls:{cert:'',key:''}})).rejects.toThrow();
    await expect(json('/health',undefined,{tls:alternate})).rejects.toThrow();
    expect(resolveSpy).not.toHaveBeenCalled();
  });
  it('application pinning rejects a different server certificate',async()=>{
    expect(await client('records',{...options,tls:{...options.tls,pinnedCertificate:alternate.cert}}).testConnection(ref)).toMatchObject({ok:false});
    expect(resolveSpy).not.toHaveBeenCalled();
  });
  it.each([0,2])('refuses contract %s before any source contact',async(contract)=>{
    const incompatible=createSidecarServer({config,tls,connector,build:{...sidecarBuild,contract}});
    try{
      const port=await incompatible.listen();
      expect(await client('records',{...options,baseUrl:`https://127.0.0.1:${port}`}).testConnection(ref)).toMatchObject({ok:false,error:{code:'dependency_unavailable',message:expect.stringContaining('contract 1')}});
      expect(resolveSpy).not.toHaveBeenCalled();
    }finally{await incompatible.close();}
  });
  it('HTTP disconnect cancels Postgres through pg_cancel_backend and releases the session',async()=>{
    const controller=new AbortController();
    const running=client('slow').sampleTopValues(ref,[elementId],2,controller.signal);
    await vi.waitFor(async()=>{
      const rows=await fixture(async(db)=>(await db.query("SELECT pid FROM pg_stat_activity WHERE usename=$1 AND state='active' AND query LIKE '%slow%'",[role])).rows);
      expect(rows).toHaveLength(1);
    });
    const start=performance.now();controller.abort();
    expect(await running).toMatchObject({ok:false,error:{message:'Source request cancelled.'}});
    await vi.waitFor(async()=>{
      const rows=await fixture(async(db)=>(await db.query('SELECT pid FROM pg_stat_activity WHERE usename=$1',[role])).rows);
      expect(rows).toHaveLength(0);expect(queryFailures).toContain('57014');
      expect((await auditRows()).at(-1)).toMatchObject({outcome:'failed'});
    },{timeout:2500});
    expect(performance.now()-start).toBeLessThan(3000);
  });
  it('validates HTTP boundaries and never reflects literal credentials',async()=>{
    expect((await json('/health',undefined,{method:'GET'})).status).toBe(405);
    expect((await json('/execute',body({}))).status).toBe(404);
    expect((await json('/health',{})).status).toBe(400);
    expect((await json('/test-connection',undefined,{raw:'{'})).status).toBe(400);
    const invalid=await json('/test-connection',{...body({}),credentialRef:sourceUrl});
    expect(invalid.status).toBe(400);expect(JSON.stringify(invalid)).not.toContain(password);
    expect(resolveSpy).not.toHaveBeenCalled();
  });
  it('bounds request bodies and generates the sidecar OpenAPI contract from shared schemas',async()=>{
    const limited=createSidecarServer({config:{...config,maxRequestBytes:64},tls,connector});
    try{
      const port=await limited.listen();
      expect((await json('/test-connection',body({large:'x'.repeat(200)}),{baseUrl:`https://127.0.0.1:${port}`})).status).toBe(413);
      expect(resolveSpy).not.toHaveBeenCalled();
    }finally{await limited.close();}
    const specification=wire.sidecarOpenApiDocument();
    expect(Object.keys(specification.paths).sort()).toEqual(['/estimate','/health','/introspect','/provision-demo','/sample','/test-connection']);
    expect(JSON.parse(await readFile(new URL('../sidecar/openapi.json',import.meta.url),'utf8'))).toEqual(specification);
  });

  it('SIGTERM to the real sidecar process cancels active SQL, flushes audit and exits cleanly',async()=>{
    const reservation=createTcpServer();
    await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));
    const address=reservation.address();if(!address||typeof address==='string')throw new Error('No port');
    const port=address.port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));
    const file=join(directory,'signal.json');const auditFile=join(directory,'signal-audit.jsonl');
    await writeFile(file,JSON.stringify({...config,port,auditFile,shutdownTimeoutMs:2000,limits:{...config.limits,statementTimeoutMs:60000,operationTimeoutMs:60000}}));
    const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('../sidecar/start.ts',import.meta.url)),file],{env:{...process.env,OPINTEL_SECRET_TEST_SOURCE:sourceUrl},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString();});child.stderr.on('data',(chunk:Buffer)=>{output+=chunk.toString();});
    const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    try{
      await vi.waitFor(()=>expect(output).toContain('Sidecar ready.'),{timeout:10000});
      const result=client('slow',{...options,baseUrl:`https://127.0.0.1:${port}`,timeoutMs:9000}).sampleTopValues(ref,[elementId],2);
      await vi.waitFor(async()=>expect((await fixture(async(db)=>(await db.query("SELECT pid FROM pg_stat_activity WHERE usename=$1 AND state='active' AND query LIKE '%slow%'",[role])).rows)).length).toBe(1));
      child.kill('SIGTERM');
      await vi.waitFor(()=>expect(child.exitCode !== null || child.signalCode !== null).toBe(true),{timeout:4000});
      await expect(exited).resolves.toEqual({code:0,signal:null});
      expect(await result).toMatchObject({ok:false});
      expect(await fixture(async(db)=>(await db.query('SELECT pid FROM pg_stat_activity WHERE usename=$1',[role])).rows)).toEqual([]);
      const events=(await readFile(auditFile,'utf8')).trim().split('\n').map(line=>JSON.parse(line) as {outcome:string});
      expect(events.map(event=>event.outcome)).toEqual(['started','failed']);
    }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;}
  },15000);

  it('validates configuration without reflecting secret values or accepting unknown fields',async()=>{
    expect(sidecarConfigSchema.safeParse({...config,limits:{...config.limits,maxConnectionsPerSource:0}}).success).toBe(false);
    const invalid=join(directory,'invalid.json');await writeFile(invalid,JSON.stringify({password:'sentinel-password'}));
    await expect(loadSidecarConfig(invalid)).rejects.toThrow('Invalid sidecar configuration fields');
    await expect(loadSidecarConfig(invalid)).rejects.not.toThrow('sentinel-password');
    const object={id:ObjectId(randomUUID()),sourceId,schema,name:'records'};
    expect(await client().estimateRowCount(ref,object)).toEqual(ok(3));
  });
});
