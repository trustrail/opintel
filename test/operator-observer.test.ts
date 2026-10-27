import {ProjectId} from '../src/shared/kernel/index.js';
import {randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {withPlatformAdmin} from '../src/platform/db/scope.js';
import {createRedisConnection,type RedisConnection} from '../src/platform/redis/index.js';
import {operatorObserverReader,withOperatorObserver} from '../src/platform/ops/observer.js';
resetDatabaseBeforeEach('company','user_account');
let redis:RedisConnection,directory:string,project:ProjectId,child:ChildProcess|undefined;
beforeEach(async()=>{
 vi.stubEnv('OPINTEL_DEPLOYMENT_PACKAGE','gateway');directory=await mkdtemp(join(tmpdir(),'operator-observer-'));project=ProjectId(randomUUID());
 redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();
 await withPlatformAdmin({actor:{kind:'system',name:'observer-test'}},async tx=>{
  const company=randomUUID(),user=randomUUID();await tx.query("INSERT INTO company(id,name,default_region) VALUES($1,'Observer','us-east-1')",[company]);
  await tx.query("INSERT INTO user_account(id,email,last_login_at) VALUES($1,'owner@example.invalid',now())",[user]);await tx.query("INSERT INTO company_member(company_id,user_id,role) VALUES($1,$2,'admin')",[company,user]);
  await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) SELECT $1,$2,id,'Observer project','us-east-1' FROM industry LIMIT 1",[project,company]);
 });
});
afterEach(async()=>{child?.kill('SIGKILL');child=undefined;await operatorObserverReader(redis.client).sweep();await redis.close();await rm(directory,{recursive:true,force:true});vi.unstubAllEnvs();vi.restoreAllMocks();});
it('DEP-020: host-only observer permits one project receipt reads, rejects writes/other endpoints, expires and revokes',async()=>{
 const file=join(directory,'observer'),reader=operatorObserverReader(redis.client),logs=vi.spyOn(console,'info').mockImplementation(()=>{});let credential='';
 await withOperatorObserver(redis.client,{projectId:project,ownerEmail:'owner@example.invalid',durationSeconds:1,file},async()=>{
  credential=await readFile(file,'utf8');expect((await stat(file)).mode&0o077).toBe(0);
  expect(await reader.read(credential,'GET',`/api/v1/projects/${project}/runs`,new URLSearchParams())).toMatchObject({method:'operator_observer'});
  for(const [method,path,query] of [['POST',`/api/v1/projects/${project}/runs`,''],['GET',`/api/v1/projects/${randomUUID()}/runs`,''],['GET','/api/v1/auth/me',''],['GET',`/api/v1/runs/${randomUUID()}`,'projectId='+randomUUID()],['POST',`/api/v1/projects/${project}/custody-provider/check`,'']])expect(await reader.read(credential,method!,path!,new URLSearchParams(query))).toBeNull();
  const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+302000);expect(await reader.read(credential,'GET',`/api/v1/projects/${project}/runs`,new URLSearchParams())).toBeNull();vi.mocked(Date.now).mockRestore();
 });
 expect(await reader.read(credential,'GET',`/api/v1/projects/${project}/runs`,new URLSearchParams())).toBeNull();
 expect(logs.mock.calls).toContainEqual([expect.objectContaining({event:'auth.operator_observer_created',projectId:project})]);expect(logs.mock.calls).toContainEqual([expect.objectContaining({event:'auth.operator_observer_revoked',projectId:project})]);expect(JSON.stringify(logs.mock.calls)).not.toContain(credential);await expect(stat(file)).rejects.toThrow();
});
it('DEP-020: killing the issuer immediately removes receipt authority without waiting for expiry',async()=>{
 const file=join(directory,'observer');child=spawn(process.execPath,['--import','tsx','test/fixtures/operator-observer/holder.ts'],{env:{...process.env,OBSERVER_PROJECT:project,OBSERVER_FILE:file},stdio:['ignore','ignore','ignore','ipc']});
 await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Observer issuer did not become ready within 10 seconds.')),10000);
  child!.once('error',error=>{clearTimeout(timer);reject(error);});
  child!.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error(`Observer issuer exited before readiness: ${code??signal}`));});
  child!.once('message',(message:unknown)=>{clearTimeout(timer);if(message==='ready')resolve();else reject(new Error('Unexpected observer issuer readiness message.'));});
 });
 const credential=await readFile(file,'utf8');expect(credential).toMatch(/^opintel_observer=/u);
 const reader=operatorObserverReader(redis.client);expect(await reader.read(credential,'GET',`/api/v1/projects/${project}/runs`,new URLSearchParams())).not.toBeNull();
 const ended=new Promise<void>(resolve=>child!.once('exit',()=>resolve()));child.kill('SIGKILL');await ended;
 await expect(reader.read(credential,'GET',`/api/v1/projects/${project}/runs`,new URLSearchParams())).resolves.toBeNull();
});
it('DEP-020: a missing normal owner login or foreign project cannot mint a credential',async()=>{
 await expect(withOperatorObserver(redis.client,{projectId:ProjectId(randomUUID()),ownerEmail:'owner@example.invalid',durationSeconds:10,file:join(directory,'foreign')},async()=>{})).rejects.toThrow('normal email login');
 await withPlatformAdmin({actor:{kind:'system',name:'observer-test'}},tx=>tx.query("UPDATE user_account SET last_login_at=NULL WHERE email='owner@example.invalid'"));
 await expect(withOperatorObserver(redis.client,{projectId:project,ownerEmail:'owner@example.invalid',durationSeconds:10,file:join(directory,'not-logged-in')},async()=>{})).rejects.toThrow('normal email login');
 vi.stubEnv('OPINTEL_DEPLOYMENT_PACKAGE','api');await expect(withOperatorObserver(redis.client,{projectId:project,ownerEmail:'owner@example.invalid',durationSeconds:10,file:join(directory,'network')},async()=>{})).rejects.toThrow('gateway-host');
});

it('DEP-020: a refused credential-file creation preserves the existing private file',async()=>{
 const file=join(directory,'existing');await writeFile(file,'existing-private-job-file',{mode:0o600});
 await expect(withOperatorObserver(redis.client,{projectId:project,ownerEmail:'owner@example.invalid',durationSeconds:1,file},async()=>{})).rejects.toThrow();
 expect(await readFile(file,'utf8')).toBe('existing-private-job-file');
});
