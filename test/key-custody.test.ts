import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,writeFile,rm,symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll,afterAll,beforeEach,it,expect,vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform,withTenant } from '../src/platform/db/scope.js';
import { ProjectId,UserId,ok,type Result } from '../src/shared/kernel/index.js';
import { FileCustody } from '../sidecar/custody/infrastructure/file-custody.js';
import { DevelopmentFileKeyStore,DevelopmentFileKeyEscrow } from '../sidecar/custody/infrastructure/development-file-keys.js';
import { KeyCustodyService,PostgresCustodyRepository,SidecarCustodyClient } from '../src/modules/entitlements/index.js';
import { SidecarTokenizer,IanaZoneResolver,TokenKey,TokenizationRun } from '../sidecar/tokenize/index.js';
import { VaultRef } from '../src/platform/vault/index.js';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { loadSidecarClientOptions } from '../src/modules/sources/index.js';
import { createSidecarServer } from '../sidecar/http/server.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { keyCustodyRoutes } from '../src/modules/entitlements/api/key-custody-routes.js';
import { once } from 'node:events';
import { Timestamp } from '../src/shared/kernel/index.js';

const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw new Error(r.error.message);return r.value;};
let directory:string,store:DevelopmentFileKeyStore,escrow:DevelopmentFileKeyStore,custody:FileCustody;
let host:ReturnType<typeof createSidecarServer>,client:SidecarCustodyClient,service:KeyCustodyService;
let ctx:{projectId:ProjectId;userId:UserId};let now=Date.now();let companyAllowed=true;
const auth={checkMany:async(requests:unknown[])=>requests.map((_,i)=>({allowed:i===0||companyAllowed,token:'test',checkedAt:Timestamp(new Date()),snapshotAgeMs:0}))};
const keys=()=>withTenant(ctx,tx=>tx.query<{version:number;sentinel_token:string;state:string;last_rehearsal:string}>('SELECT * FROM token_key_version ORDER BY version'));
const initialize=()=>service.execute(ctx,'initialize');
const rotate=()=>service.execute(ctx,'rotate',{confirmation:'Custody',reason:'Deliberate test rotation'});
const token=async()=>unwrap(await new SidecarTokenizer(custody,new IanaZoneResolver(),{record:()=>{}}).run(ctx.projectId,run=>run.tokenize('same customer',{domain:'c',canonId:'stdtext1',mode:'text'})));

resetDatabaseBeforeEach('company','user_account');
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'custody-'));await prepareSidecarDevelopment(directory);
 const {config,tls}=await loadSidecarConfig(join(directory,'service.json'));
 store=await DevelopmentFileKeyStore.open(config.custody!.keyStore);escrow=await DevelopmentFileKeyEscrow.open(config.custody!.keyEscrow);
 custody=new FileCustody(store,escrow,()=>now);
 const unused=async()=>ok({reachable:true as const});
 host=createSidecarServer({config:{...config,port:0},tls,custody,connector:{testConnection:unused,introspect:unused,sampleTopValues:unused,estimateRowCount:unused} as Parameters<typeof createSidecarServer>[0]['connector']});
 const port=await host.listen();const options=await loadSidecarClientOptions(join(directory,'client.json'));client=new SidecarCustodyClient({...options,baseUrl:`https://127.0.0.1:${port}`});
 service=new KeyCustodyService(new PostgresCustodyRepository(),client,auth as ConstructorParameters<typeof KeyCustodyService>[2]);
},30000);
afterAll(async()=>{await host?.close();await rm(directory,{recursive:true,force:true});},30000);
beforeEach(async()=>{
 companyAllowed=true;now=Date.now();ctx={projectId:ProjectId(randomUUID()),userId:UserId(randomUUID())};
 await withPlatform(async tx=>{
  await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[ctx.userId,ctx.userId+'@test.example']);
  const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Custody company','eu-west-1') RETURNING id");
  const [industry]=await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
  await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,'Custody','eu-west-1')",[ctx.projectId,company!.id,industry!.id]);
  await tx.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'admin')",[ctx.projectId,ctx.userId]);
 });
});
it('TOK-27: initialization verifies backup, is durable/idempotent, and never replaces a key on retry',async()=>{
 expect((await keys())).toEqual([]);
 const first=unwrap(await initialize());expect(first).toMatchObject({currentVersion:1,versions:[{backupVerifiedAt:expect.any(String),lastRehearsal:'ok'}]});
 const original=await store.resolveBytes(VaultRef(`vault://custody/${ctx.projectId}/v1`));
 const restarted=new FileCustody(store,escrow);
 expect(unwrap(await restarted.invoke('initialize',ctx.projectId,{}))).toMatchObject({keyVersion:1,created:false});
 expect(await restarted.resolveBytes(VaultRef(`vault://opintel/token-key/${ctx.projectId}`))).toEqual(original);original.fill(0);
 expect(unwrap(await initialize()).versions).toHaveLength(1);
 expect(await withPlatform(tx=>tx.query('SELECT token_key_version FROM project WHERE id=$1',[ctx.projectId]))).toEqual([{token_key_version:1}]);
},30000);
it('TOK-27: failed escrow write refuses connection naming the step; retry keeps the first primary key',async()=>{
 const write=vi.spyOn(escrow,'write').mockRejectedValueOnce(new Error('sensitive exception'));
 const refused=await service.ensure(ctx);expect(refused).toMatchObject({ok:false,error:{message:'Token key escrow write failed. Check the configured backup location and retry.'}});write.mockRestore();
 const primary=await readFile(join(store.location,ctx.projectId,'v1'),'utf8');
 expect(await keys()).toEqual([]);expect((await service.ensure(ctx)).ok).toBe(true);
 expect(await readFile(join(store.location,ctx.projectId,'v1'),'utf8')).toBe(primary);
},30000);
it('TOK-28: rehearsal reads only escrow, detects mismatch AND missing old versions, and records observations',async()=>{
 unwrap(await initialize());unwrap(await rotate());
 const primary=vi.spyOn(store,'resolveBytes').mockRejectedValue(new Error('Primary is forbidden during rehearsal'));
 await writeFile(join(escrow.location,ctx.projectId,'v1'),'ab'.repeat(32));
 expect(unwrap(await service.execute(ctx,'rehearse')).versions.find(v=>v.version===1)).toMatchObject({lastRehearsal:'mismatch',backupVerifiedAt:null});
 expect(primary).not.toHaveBeenCalled();primary.mockRestore();
 await rm(join(escrow.location,ctx.projectId,'v1'));
 expect(unwrap(await service.execute(ctx,'rehearse')).versions.find(v=>v.version===1)?.lastRehearsal).toBe('failed');
 await withTenant(ctx,tx=>tx.query("UPDATE token_key_version SET last_rehearsed_at=now()-interval '2 days'"));
 await service.daily();expect((await keys())[0]!.last_rehearsal).toBe('failed');
},30000);
it('TOK-16/TOK-29: rotation changes tokens, records reason/actor/version, and retains the old key for verification',async()=>{
 unwrap(await initialize());const before=await token();const original=(await keys())[0]!.sentinel_token;
 const view=unwrap(await rotate());expect(view).toMatchObject({currentVersion:2,versions:[{version:2,reason:'Deliberate test rotation',lastRehearsal:'ok'},{version:1,state:'retired',lastRehearsal:'ok'}]});
 expect(await token()).not.toBe(before);
 const old=unwrap(TokenKey.take(await store.resolveBytes(VaultRef(`vault://custody/${ctx.projectId}/v1`))));
 try{const run=new TokenizationRun(old,new IanaZoneResolver());expect(unwrap(run.sentinel())).toBe(original);expect(unwrap(run.tokenize('same customer',{domain:'c',canonId:'stdtext1',mode:'text'}))).toBe(before);}finally{old.dispose();}
 expect(await escrow.exists(ctx.projectId+'/v1')).toBe(true);
 expect(await withTenant(ctx,tx=>tx.query("SELECT kind,reason,completed_at IS NOT NULL AS done FROM token_key_operation WHERE kind='rotate'"))).toEqual([{kind:'rotate',reason:'Deliberate test rotation',done:true}]);
},30000);
it('TOK-16: failed rotation verification keeps the old key current',async()=>{
 unwrap(await initialize());const before=await token();const read=vi.spyOn(escrow,'resolveBytes').mockResolvedValueOnce(new Uint8Array(32).fill(91));
 expect(await rotate()).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});read.mockRestore();
 expect(await token()).toBe(before);expect((await keys()).map(k=>k.version)).toEqual([1]);
},30000);
it('restore rejects mismatching escrow before commit, then restores the exact prepared bytes despite a later escrow change',async()=>{
 unwrap(await initialize());const original=await readFile(join(store.location,ctx.projectId,'v1'),'utf8');
 await writeFile(join(escrow.location,ctx.projectId,'v1'),'cd'.repeat(32));
 const commit=vi.spyOn(client,'call');expect(await service.execute(ctx,'restore',{keyVersion:1,confirmation:'Custody'})).toMatchObject({ok:false,error:{code:'conflict'}});
 expect(commit.mock.calls.some(c=>c[1]==='restore/commit')).toBe(false);commit.mockRestore();
 expect(await readFile(join(store.location,ctx.projectId,'v1'),'utf8')).toBe(original);
 now+=600001;await writeFile(join(escrow.location,ctx.projectId,'v1'),original);
 const prepared=unwrap(await client.call(ctx.projectId,'restore/prepare',{keyVersion:1}));
 await writeFile(join(escrow.location,ctx.projectId,'v1'),'ef'.repeat(32));await writeFile(join(store.location,ctx.projectId,'v1'),'ab'.repeat(32));
 expect(unwrap(await client.call(ctx.projectId,'restore/commit',{candidateId:prepared.candidateId}))).toMatchObject({sentinelToken:prepared.sentinelToken});
 expect(await readFile(join(store.location,ctx.projectId,'v1'),'utf8')).toBe(original);
 expect(await client.call(ctx.projectId,'restore/commit',{candidateId:prepared.candidateId})).toMatchObject({ok:false,error:{code:'conflict'}});
},30000);
it('candidate expiry deletes only uncommitted keys; confirmation and both-admin restore are enforced',async()=>{
 unwrap(await initialize());const prepared=unwrap(await client.call(ctx.projectId,'rotate/prepare',{expectedCurrentVersion:1}));now+=600001;
 expect(await client.call(ctx.projectId,'rotate/commit',{candidateId:prepared.candidateId})).toMatchObject({ok:false,error:{code:'conflict'}});
 expect(await store.exists(ctx.projectId+'/candidate-'+prepared.candidateId)).toBe(false);expect(await escrow.exists(ctx.projectId+'/candidate-'+prepared.candidateId)).toBe(false);expect(await store.exists(ctx.projectId+'/v1')).toBe(true);
 expect(await service.execute(ctx,'rotate',{confirmation:'wrong',reason:'test'})).toMatchObject({ok:false,error:{code:'validation_failed'}});
 companyAllowed=false;expect(await service.execute(ctx,'restore',{keyVersion:1,confirmation:'Custody'})).toMatchObject({ok:false,error:{code:'forbidden'}});
},30000);
it('separation resolves symlinks and refuses one location for both ports',async()=>{
 const alias=join(directory,'store-alias');await symlink(store.location,alias);
 expect(()=>new FileCustody(store,store)).toThrow('different locations');
 const aliased=await DevelopmentFileKeyEscrow.open(alias);expect(()=>new FileCustody(store,aliased)).toThrow('different locations');
});
it('new custody tables are tenant isolated and version history cannot be deleted',async()=>{
 unwrap(await initialize());const other={...ctx,projectId:ProjectId(randomUUID())};expect(await withTenant(other,tx=>tx.query('SELECT * FROM token_key_version'))).toEqual([]);
 await expect(withTenant(ctx,tx=>tx.query('DELETE FROM token_key_version'))).rejects.toMatchObject({code:'42501'});
});
it('public custody routes use declared permissions and return TokenKeyView without sentinels or key material',async()=>{
 const api=createHttpServer(keyCustodyRoutes(service),{authorization:{port:{...auth,check:async()=>({allowed:true,token:'test',checkedAt:Timestamp(new Date()),snapshotAgeMs:0})} as Parameters<typeof createHttpServer>[1]['authorization']['port'],currentUser:async()=>({id:ctx.userId,email:'custody@test.example',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})}});
 api.listen(0,'127.0.0.1');await once(api,'listening');const address=api.address();if(!address||typeof address==='string')throw new Error();
 try{const response=await fetch(`http://127.0.0.1:${address.port}/api/v1/projects/${ctx.projectId}/token-key/initialize`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});expect(response.status).toBe(200);const value=await response.json();expect(value).toMatchObject({currentVersion:1});expect(JSON.stringify(value)).not.toContain('sentinel');}finally{await new Promise<void>((resolve,reject)=>api.close(error=>error?reject(error):resolve()));}
},30000);
it('an interrupted commit response recovers from the durable prepared sentinel without a second rotation',async()=>{
 unwrap(await initialize());const call=client.call.bind(client);let lost=true;
 const spy=vi.spyOn(client,'call').mockImplementation(async(project,operation,payload)=>{
  const response=await call(project,operation,payload);
  if(operation==='rotate/commit'&&lost){lost=false;return {ok:false,error:{code:'dependency_unavailable',message:'Lost response',retryable:true}};}
  return response;
 });
 try{expect((await rotate()).ok).toBe(false);expect((await keys()).map(k=>k.version)).toEqual([1]);expect(unwrap(await rotate()).currentVersion).toBe(2);expect((await keys()).map(k=>k.version)).toEqual([1,2]);}finally{spy.mockRestore();}
},30000);
it('missing custody history refuses rather than silently selecting an older key',async()=>{
 unwrap(await initialize());unwrap(await rotate());await rm(join(store.location,ctx.projectId,'state.json'));
 expect(await client.call(ctx.projectId,'initialize',{})).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});
 expect(await store.exists(ctx.projectId+'/v2')).toBe(true);
},30000);
it('a crash during promotion leaves a resumable candidate; expiry discards only its unpublished version',async()=>{
 unwrap(await initialize());const candidate=unwrap(await client.call(ctx.projectId,'rotate/prepare',{expectedCurrentVersion:1}));
 const write=vi.spyOn(escrow,'write').mockRejectedValueOnce(new Error('Unavailable'));
 expect((await client.call(ctx.projectId,'rotate/commit',{candidateId:candidate.candidateId})).ok).toBe(false);write.mockRestore();
 expect(await store.exists(ctx.projectId+'/v2')).toBe(true);now+=600001;unwrap(await client.call(ctx.projectId,'status',{}));
 expect(await store.exists(ctx.projectId+'/v2')).toBe(false);expect(await store.exists(ctx.projectId+'/v1')).toBe(true);expect(unwrap(await rotate()).currentVersion).toBe(2);
},30000);
it('an Idempotency-Key cannot rotate twice or be reused for a different request',async()=>{
 unwrap(await initialize());const input={confirmation:'Custody',reason:'Scheduled rotation',requestKey:randomUUID()};
 expect(unwrap(await service.execute(ctx,'rotate',input)).currentVersion).toBe(2);
 expect(unwrap(await service.execute(ctx,'rotate',input)).currentVersion).toBe(2);
 expect(await service.execute(ctx,'rotate',{...input,reason:'Different rotation'})).toMatchObject({ok:false,error:{code:'conflict'}});
 expect((await keys()).map(k=>k.version)).toEqual([1,2]);
},30000);
it('custody never sends generated key bytes in responses, database metadata or logs',async()=>{
 const output:unknown[]=[];const logs=['info','warn','error','log','debug'].map(method=>vi.spyOn(console,method as 'log').mockImplementation((...args:unknown[])=>{output.push(args);}));
 try{
  const responses:unknown[]=[unwrap(await initialize()),unwrap(await rotate()),unwrap(await client.call(ctx.projectId,'status',{})),unwrap(await client.call(ctx.projectId,'rehearse',{}))];
  responses.push(await withTenant(ctx,tx=>tx.query('SELECT row_to_json(v) FROM token_key_version v')));
  responses.push(await withTenant(ctx,tx=>tx.query('SELECT row_to_json(o) FROM token_key_operation o')));
  const rendered=JSON.stringify({output,responses});
  for(const v of [1,2]){const bytes=await store.resolveBytes(VaultRef(`vault://custody/${ctx.projectId}/v${v}`));try{for(const value of [Buffer.from(bytes).toString('hex'),Buffer.from(bytes).toString('base64'),Buffer.from(bytes).toString('utf8')])expect(rendered).not.toContain(value);}finally{bytes.fill(0);}}
 }finally{logs.forEach(log=>log.mockRestore());}
},30000);
