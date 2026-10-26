import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {EngineRegistry,PostgresEngineRepository,PostgresEngineEgress,RegistryQueryExecution,engineHealthPolicy} from '../src/modules/engines/index.js';
import {SidecarQueryExecution} from '../src/modules/mcp/index.js';
import type {EngineProbe} from '../src/modules/engines/index.js';
import {DomainError,EngineId,err,ok} from '../src/shared/kernel/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';

const registries:EngineRegistry[]=[];
afterEach(()=>{for(const registry of registries.splice(0))registry.close();vi.useRealTimers();vi.restoreAllMocks();});
async function fixture(){
 const f=await policyFixture(1),repo=new PostgresEngineRepository();
 let now=Date.now(),heartbeatAt=now,policyCurrent=true;
 const health=vi.fn<EngineProbe['health']>(async()=>ok({contract:3,queryEngineVersion:'fixture-build',canonicalisers:[]}));
 const probe={health,sentinel:vi.fn(async()=>ok({version:1,sentinel:'fixture-sentinel'})),registerEgress:vi.fn<NonNullable<EngineProbe['registerEgress']>>(async()=>ok(undefined))};
 const registry=new EngineRegistry(repo,probe,{ca:'fixture',cert:'fixture',key:'fixture'},{reuseEnabled:true},()=>now);registries.push(registry);
 const engine=unwrap(await registry.register(f.ctx,{name:'Admission fixture',address:'https://127.0.0.1:9443',certificatePin:'11'.repeat(32)}));
 unwrap(await registry.verify(f.ctx,engine.id));unwrap(await repo.assign(f.ctx,f.source,engine.id));
 const heartbeat=vi.spyOn(repo,'heartbeat').mockImplementation(async()=>({at:new Date(heartbeatAt).toISOString(),policyCurrent,record:unwrap(await repo.get(f.ctx,engine.id))}));
 const admit=()=>registry.forQuerySources(f.ctx,[{id:f.source}]);
 return {...f,repo,probe,registry,engine,heartbeat,admit,advance:(ms:number)=>{now+=ms;},syncClock:()=>{now=Date.now();},beat:()=>{heartbeatAt=now;},denyPolicy:()=>{policyCurrent=false;}};
}
const stall=()=>err(new DomainError('source_unavailable','Connect timed out.',{cause:'engine_registry',reason:'control_connect_timeout'},true));

it('ENG-H01: a stalled refresh preserves bounded health; current heartbeat cannot extend it',async()=>{
 const f=await fixture();expect((await f.admit())[0]?.ok).toBe(true);
 const before=unwrap(await f.repo.get(f.ctx,f.engine.id));
 f.probe.health.mockImplementation(async()=>stall());f.advance(5000);f.beat();await f.registry.refreshHealth();
 expect((await f.admit())[0]?.ok).toBe(true);expect(unwrap(await f.repo.get(f.ctx,f.engine.id))).toEqual(before);
 f.advance(25000);f.beat();expect((await f.admit())[0]).toMatchObject({ok:false,error:{code:'source_unavailable',details:{cause:'engine_registry'}}});
 expect(unwrap(await f.repo.get(f.ctx,f.engine.id)).verifiedAt).toBe(before.verifiedAt);
});

it('ENG-H02: fresh authenticated health renews age; registration stalls alone do not erase it',async()=>{
 const f=await fixture();unwrap((await f.admit())[0]!);f.advance(25000);f.beat();await f.registry.refreshHealth();
 f.advance(10000);f.beat();expect((await f.admit())[0]?.ok).toBe(true);
 f.probe.registerEgress.mockImplementation(async()=>stall());f.advance(5000);f.beat();await f.registry.refreshHealth();
 expect((await f.admit())[0]?.ok).toBe(true);
 f.advance(15000);f.beat();expect((await f.admit())[0]?.ok).toBe(false);
});

it('ENG-H03: stale heartbeat requires synchronous health, does not renew heartbeat, and preserves policy refusal',async()=>{
 const f=await fixture();const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 f.advance(15000);const calls=f.probe.health.mock.calls.length;
 expect((await f.admit())[0]?.ok).toBe(true);expect(f.probe.health).toHaveBeenCalledTimes(calls+1);
 expect(log).toHaveBeenCalledWith({event:'engine.heartbeat_stale',timestamp:expect.any(String),engineId:f.engine.id,ageMs:15000});
 expect((await f.admit())[0]?.ok).toBe(true);expect(f.probe.health).toHaveBeenCalledTimes(calls+2);
 f.denyPolicy();expect((await f.admit())[0]?.ok).toBe(false);expect(f.probe.health).toHaveBeenCalledTimes(calls+2);
});

it('ENG-H03: stale heartbeat cannot reuse health when synchronous verification stalls',async()=>{
 const f=await fixture();f.advance(15000);f.probe.health.mockImplementation(async()=>stall());
 expect((await f.admit())[0]?.ok).toBe(false);
});

it('ENG-H03: stale-heartbeat health success does not depend on redundant egress registration transport',async()=>{
 const f=await fixture();f.advance(15000);f.probe.registerEgress.mockImplementation(async()=>stall());
 const calls=f.probe.registerEgress.mock.calls.length;expect((await f.admit())[0]?.ok).toBe(true);expect(f.probe.registerEgress).toHaveBeenCalledTimes(calls);
});

it('ENG-H03: heartbeat expiring during token attestation requires fresh pinned health at dispatch',async()=>{
 const f=await fixture();
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO token_key_version(project_id,version,sentinel_token,state) VALUES($1,1,'fixture-sentinel','current')",[f.ctx.projectId]));
 f.probe.sentinel.mockImplementation(async()=>{f.advance(16000);return ok({version:1,sentinel:'fixture-sentinel'});});
 const calls=f.probe.health.mock.calls.length;
 expect((await f.registry.forQuerySources(f.ctx,[{id:f.source,tokenized:true}]))[0]?.ok).toBe(true);expect(f.probe.health).toHaveBeenCalledTimes(calls+1);
 f.probe.health.mockImplementation(async()=>stall());
 expect((await f.registry.forQuerySources(f.ctx,[{id:f.source,tokenized:true}]))[0]?.ok).toBe(false);
});

it('ENG-H03: policy change during fallback verification still refuses',async()=>{
 const f=await fixture();f.advance(15000);f.probe.health.mockImplementation(async()=>{f.denyPolicy();return ok({contract:3,queryEngineVersion:'fixture-build',canonicalisers:[]});});
 expect((await f.admit())[0]?.ok).toBe(false);
});

it('ENG-H04: explicit bad health refuses immediately even if a new query probe would succeed',async()=>{
 const f=await fixture();f.probe.health.mockImplementation(async()=>err(new DomainError('source_unavailable','Readiness failed.',{readinessReason:'source_connection_refused'})));
 await f.registry.verify(f.ctx,f.engine.id);f.probe.health.mockResolvedValue(ok({contract:3,queryEngineVersion:'fixture-build',canonicalisers:[]}));
 const calls=f.probe.health.mock.calls.length;expect((await f.admit())[0]?.ok).toBe(false);expect(f.probe.health).toHaveBeenCalledTimes(calls);
});

it.each(['wrong_pin','explicit_unhealthy','contract_mismatch'] as const)('ENG-H04: %s immediately invalidates reuse',async failure=>{
 const f=await fixture();unwrap((await f.admit())[0]!);
 if(failure==='contract_mismatch')f.probe.health.mockResolvedValue(ok({contract:99,queryEngineVersion:'other',canonicalisers:[]}));
 else f.probe.health.mockImplementation(async()=>err(new DomainError('source_unavailable','Failed verification.',failure==='explicit_unhealthy'?{readinessReason:'source_connection_refused'}:undefined)));
 await f.registry.refreshHealth();expect((await f.admit())[0]?.ok).toBe(false);
 expect(unwrap(await f.repo.get(f.ctx,f.engine.id)).verifiedAt).toBeNull();
});

it('ENG-H05: unknown, edited and never-verified engines cannot inherit health',async()=>{
 const f=await fixture();unwrap((await f.admit())[0]!);
 expect((await f.registry.ready(f.ctx,EngineId(randomUUID()))).ok).toBe(false);
 await f.registry.update(f.ctx,f.engine.id,{name:f.engine.name,address:f.engine.address,certificatePin:'22'.repeat(32)});
 expect((await f.admit())[0]?.ok).toBe(false);
 await f.registry.update(f.ctx,f.engine.id,{name:f.engine.name,address:f.engine.address,certificatePin:f.engine.certificatePin});
 expect((await f.admit())[0]?.ok).toBe(false);
});

it('ENG-H06: background refresh is independent, deduplicated, and cannot block fresh admission',async()=>{
 const f=await fixture();unwrap((await f.admit())[0]!);
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 f.probe.health.mockImplementation(async()=>{await pending;return ok({contract:3,queryEngineVersion:'fixture-build',canonicalisers:[]});});
 vi.useFakeTimers({toFake:['setInterval','clearInterval']});f.registry.startHealthRefresh();f.registry.startHealthRefresh();
 await vi.advanceTimersByTimeAsync(5000);await vi.waitFor(()=>expect(f.probe.health).toHaveBeenCalledTimes(2));
 await vi.advanceTimersByTimeAsync(5000);expect(f.probe.health).toHaveBeenCalledTimes(2);
 expect((await f.admit())[0]?.ok).toBe(true);
 const other=f.registry.refreshHealth();release();await other;
 f.registry.close();const calls=f.probe.health.mock.calls.length;await vi.advanceTimersByTimeAsync(10000);expect(f.probe.health).toHaveBeenCalledTimes(calls);
});

it('ENG-H07: configuration change during refresh cannot publish or reuse the old observation',async()=>{
 const f=await fixture();unwrap((await f.admit())[0]!);
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 f.probe.health.mockImplementation(async()=>{await pending;return ok({contract:3,queryEngineVersion:'fixture-build',canonicalisers:[]});});
 const refresh=f.registry.refreshHealth();await vi.waitFor(()=>expect(f.probe.health).toHaveBeenCalledTimes(2));
 await f.registry.update(f.ctx,f.engine.id,{name:f.engine.name,address:f.engine.address,certificatePin:'22'.repeat(32)});release();await refresh;
 expect((await f.admit())[0]?.ok).toBe(false);
});

it('ENG-H07: an edit and revert cannot revive an in-flight observation from the old registration version',async()=>{
 const f=await fixture();unwrap((await f.admit())[0]!);
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 f.probe.health.mockImplementation(async()=>{await pending;return ok({contract:3,queryEngineVersion:'fixture-build',canonicalisers:[]});});
 const refresh=f.registry.refreshHealth();await vi.waitFor(()=>expect(f.probe.health).toHaveBeenCalledTimes(2));
 await f.registry.update(f.ctx,f.engine.id,{name:f.engine.name,address:f.engine.address,certificatePin:'22'.repeat(32)});
 await f.registry.update(f.ctx,f.engine.id,{name:f.engine.name,address:f.engine.address,certificatePin:f.engine.certificatePin});
 release();await refresh;
 expect(unwrap(await f.repo.get(f.ctx,f.engine.id))).toMatchObject({registrationVersion:3,verifiedAt:null,health:'unverified'});
 expect((await f.admit())[0]?.ok).toBe(false);
});

it('ENG-H08: query preparation uses the observed build without a second /health socket',async()=>{
 const f=await fixture(),wire=vi.spyOn(SidecarQueryExecution.prototype,'health');
 const client=new RegistryQueryExecution(f.registry,f.repo),context={...f.ctx,sources:[f.source]};
 expect(unwrap(await client.health(undefined,context))).toEqual({queryEngineVersion:'fixture-build'});
 expect(unwrap(await client.health(undefined,{...context,parserOnly:true}))).toEqual({queryEngineVersion:'fixture-build'});
 expect(wire).not.toHaveBeenCalled();expect(f.probe.health).toHaveBeenCalledTimes(1);
});

it('ENG-H05: a cold gateway cannot use a persisted healthy flag as a health observation',async()=>{
 const f=await fixture();const cold=new EngineRegistry(f.repo,{...f.probe,health:async()=>stall()},{ca:'different trust instance',cert:'fixture',key:'fixture'},{reuseEnabled:true});registries.push(cold);
 expect((await cold.forQuerySources(f.ctx,[{id:f.source}]))[0]?.ok).toBe(false);
});

it('ENG-H06: a successful refresh racing a heartbeat read does not create a false refusal',async()=>{
 const f=await fixture();unwrap((await f.admit())[0]!);
 const original=f.heartbeat.getMockImplementation()!;
 f.heartbeat.mockImplementationOnce(async()=>{await f.registry.refreshHealth();return original(f.ctx,unwrap(await f.repo.get(f.ctx,f.engine.id)));});
 expect((await f.admit())[0]?.ok).toBe(true);
});

it('ENG-H09: heartbeat admission checks the actual scoped policy and registration identity',async()=>{
 const f=await fixture();f.heartbeat.mockRestore();const egress=new PostgresEngineEgress();
 expect((await f.repo.heartbeat(f.ctx,unwrap(await f.repo.get(f.ctx,f.engine.id)))).policyCurrent).toBe(false);
 expect((await f.admit())[0]?.ok).toBe(false);
 const policy=unwrap(await egress.heartbeat(f.engine.certificatePin,{projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:null})).policy;
 unwrap(await egress.heartbeat(f.engine.certificatePin,{projectId:f.ctx.projectId,engineId:f.engine.id,appliedVersion:policy.version}));f.syncClock();
 expect((await f.admit())[0]?.ok).toBe(true);
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET credential_ref='secret://test/changed' WHERE id=$1",[f.source]));
 expect((await f.admit())[0]?.ok).toBe(false);
 const old=unwrap(await f.repo.get(f.ctx,f.engine.id));
 await f.registry.update(f.ctx,f.engine.id,{name:f.engine.name,address:f.engine.address,certificatePin:'22'.repeat(32)});
 expect((await f.repo.heartbeat(f.ctx,old)).policyCurrent).toBe(false);
});

it('ENG-H10: configurable defaults are bounded and heartbeat-free tooling cannot reuse health',()=>{
 expect(engineHealthPolicy({ENGINE_HEARTBEAT_URL:'https://gateway.example'})).toEqual({maxAgeMs:30000,refreshMs:5000,heartbeatMaxAgeMs:15000,reuseEnabled:true});
 expect(engineHealthPolicy({}).reuseEnabled).toBe(false);
 expect(engineHealthPolicy({ENGINE_HEALTH_MAX_AGE_MS:'40000',ENGINE_HEALTH_REFRESH_MS:'2000',ENGINE_HEARTBEAT_MAX_AGE_MS:'10000'})).toMatchObject({maxAgeMs:40000,refreshMs:2000,heartbeatMaxAgeMs:10000});
 for(const value of ['0','-1','NaN','Infinity','2147483648'])expect(()=>engineHealthPolicy({ENGINE_HEALTH_MAX_AGE_MS:value})).toThrow();
 expect(()=>engineHealthPolicy({ENGINE_HEALTH_REFRESH_MS:'30000'})).toThrow();
});

it('ENG-H07: forward registration-version migration round-trips without changing engine metadata',async()=>{
 const f=await fixture(),db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');
  const before=await db.query("SELECT to_jsonb(e)-'registration_version' AS value FROM engine e WHERE id=$1",[f.engine.id]);
  await db.query(await readFile('migrations/084_engine_registration_version.down.sql','utf8'));
  await db.query(await readFile('migrations/084_engine_registration_version.up.sql','utf8'));
  const after=await db.query("SELECT to_jsonb(e)-'registration_version' AS value,registration_version FROM engine e WHERE id=$1",[f.engine.id]);
  expect(after.rows[0]?.value).toEqual(before.rows[0]?.value);expect(after.rows[0]?.registration_version).toBe(1);
  await db.query('SAVEPOINT invalid_version');
  await expect(db.query('UPDATE engine SET registration_version=0 WHERE id=$1',[f.engine.id])).rejects.toMatchObject({code:'23514'});
  await db.query('ROLLBACK TO SAVEPOINT invalid_version');
 }finally{await db.query('ROLLBACK');await db.end();}
});
