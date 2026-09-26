import { randomUUID,createHash } from 'node:crypto';
import { once } from 'node:events';
import { describe,expect,it,vi } from 'vitest';
import { PoolKeyService,PostgresPoolKeys,PostgresKeyVerifier,poolKeyId,type AgentPresenceQuery } from '../src/modules/pools/index.js';
import { poolKeyRoutes } from '../src/modules/pools/api/key-routes.js';
import { PoolId,TestClock,ok,err,DomainError,type Result } from '../src/shared/kernel/index.js';
import { withTenant,withPlatform } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { PoolKeyCreationResponse } from '../src/shared/api/pool-keys.js';
import { bulkFixture,allowBulk } from './fixtures/bulk-entitlements/fixture.js';
function unwrap<T>(result:Result<T>):T {if(!result.ok)throw new Error(result.error.message);return result.value;}
async function fixture(){
 const f=await bulkFixture(0);const clock=new TestClock();
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 const agents=Array.from({length:20},(_,i)=>`agent-${i}`);
 const affected=vi.fn<AgentPresenceQuery['affected']>(async()=>ok({affectedAgents:agents,affectedAgentCount:agents.length}));
 const repository=new PostgresPoolKeys(clock),service=new PoolKeyService(repository,{affected}),verifier=new PostgresKeyVerifier(clock);
 const create=async(name='Reporting',idempotency=randomUUID())=>PoolKeyCreationResponse.parse(unwrap(await service.execute(f.ctx,{kind:'create',name},idempotency)));
 const initial=await create();if(!initial.keyShown)throw new Error('Expected initial key');
 const pool=PoolId(initial.poolId);
 const rotate=(key=randomUUID())=>service.execute(f.ctx,{kind:'rotate',poolId:pool},key);
 const revoke=(keyVersion=initial.keyVersion,confirmation='Reporting',key=randomUUID())=>service.execute(f.ctx,{kind:'revoke',poolId:pool,keyVersion:unwrap(poolKeyId(keyVersion)),confirmation},key);
 return {...f,clock,affected,repository,service,verifier,create,initial,pool,rotate,revoke};
}
describe('5.2 pool keys',{timeout:30_000},()=>{
 it('I-001/I-002: base62 generation, SHA-256 at rest, metadata-only concurrent replay and no logging',async()=>{
  const log=vi.spyOn(console,'log'),info=vi.spyOn(console,'info'),warn=vi.spyOn(console,'warn'),error=vi.spyOn(console,'error');
  try{
   const f=await fixture();const request=randomUUID();
   const attempts=await Promise.all(Array.from({length:8},()=>f.create('Once',request)));
   const issued=attempts.filter(r=>r.keyShown);expect(issued).toHaveLength(1);
   const first=issued[0]!;if(!first.keyShown)throw new Error('Not issued');
   expect(first.key).toMatch(/^opk_live_[A-Za-z0-9]{22}$/u);
   for(const replay of attempts.filter(r=>!r.keyShown)){expect(replay).toEqual({...first,key:undefined,keyShown:false});expect(replay).not.toHaveProperty('key');}
   const rows=await withTenant(f.ctx,tx=>tx.query<{key_hash:Buffer;key_prefix:string}>('SELECT key_hash,key_prefix FROM pool_key WHERE pool_id=$1',[first.poolId]));
   expect(rows[0]!.key_hash).toEqual(createHash('sha256').update(first.key).digest());
   expect(rows[0]!.key_prefix).toBe(first.key.slice(0,16));
   const durable=await withTenant(f.ctx,async tx=>({keys:await tx.query('SELECT * FROM pool_key'),receipts:await tx.query('SELECT * FROM pool_key_request'),pools:await tx.query('SELECT * FROM pool')}));
   expect(JSON.stringify(durable)).not.toContain(first.key);
   expect(JSON.stringify([log.mock.calls,info.mock.calls,warn.mock.calls,error.mock.calls])).not.toContain(first.key);
   expect(await f.verifier.verify(first.key)).toMatchObject({ok:true,pool:{id:first.poolId},keyState:'current'});
   const conflict=await f.create('Different',request).catch(e=>e as Error);expect(conflict).toBeInstanceOf(Error);
  }finally{log.mockRestore();info.mockRestore();warn.mockRestore();error.mockRestore();}
 });
 it('I-015: twenty agents can use either key throughout rotation without failures; retry does not rotate again',async()=>{
  const f=await fixture();const key=randomUUID();
  const during=await Promise.all([f.rotate(key),...Array.from({length:20},()=>f.verifier.verify(f.initial.key))]);
  expect(during.every(r=>r.ok)).toBe(true);
  const rotated=PoolKeyCreationResponse.parse(unwrap(during[0]!));if(!rotated.keyShown)throw new Error('Not issued');
  expect(await Promise.all(Array.from({length:20},async()=>[await f.verifier.verify(f.initial.key),await f.verifier.verify(rotated.key)]))).toEqual(Array.from({length:20},()=>[expect.objectContaining({ok:true,keyState:'retiring'}),expect.objectContaining({ok:true,keyState:'current'})]));
  expect(unwrap(await f.rotate(key))).toEqual({...rotated,key:undefined,keyShown:false});
  const refused=await f.rotate();expect(refused).toMatchObject({ok:false,error:{code:'conflict',details:{keyVersion:f.initial.keyVersion,graceUntil:'2026-01-02T00:00:00.000Z'}}});
  expect(!refused.ok&&refused.error.message).toContain(f.initial.keyVersion);
 });
 it('I-016: expires at equality without a worker, reports the old-key agents and frees the retiring slot',async()=>{
  const f=await fixture();unwrap(await f.rotate());f.clock.advance(86400000-1);
  expect(await f.verifier.verify(f.initial.key)).toMatchObject({ok:true});f.clock.advance(1);
  expect(await f.verifier.verify(f.initial.key)).toEqual({ok:false,reason:'expired'});
  expect(unwrap(await f.service.affected(f.ctx,f.pool,unwrap(poolKeyId(f.initial.keyVersion))))).toMatchObject({state:'expired',affectedAgentCount:20,affectedAgents:Array.from({length:20},(_,i)=>`agent-${i}`)});
  expect(f.affected).toHaveBeenCalledWith(f.ctx,f.pool,f.initial.keyVersion);
  expect((await f.rotate()).ok).toBe(true);
 });
 it('I-017: typed pool name and explicit version, immediate revoke of only that key, idempotent retry',async()=>{
  const f=await fixture();const rotated=PoolKeyCreationResponse.parse(unwrap(await f.rotate()));if(!rotated.keyShown)throw new Error('Not issued');
  expect(await f.revoke(f.initial.keyVersion,'reporting')).toMatchObject({ok:false,error:{code:'validation_failed'}});
  expect(await f.verifier.verify(f.initial.key)).toMatchObject({ok:true});
  const request=randomUUID(),revoked=unwrap(await f.revoke(f.initial.keyVersion,'Reporting',request));
  expect(revoked).toMatchObject({state:'revoked',keyShown:false,affectedAgentCount:20});
  expect(unwrap(await f.revoke(f.initial.keyVersion,'Reporting',request))).toEqual(revoked);
  expect(await f.verifier.verify(f.initial.key)).toEqual({ok:false,reason:'revoked'});
  expect(await f.verifier.verify(rotated.key)).toMatchObject({ok:true});
  expect((await f.revoke(rotated.keyVersion)).ok).toBe(true);
  expect(await f.verifier.verify(rotated.key)).toEqual({ok:false,reason:'revoked'});
  expect((await f.rotate()).ok).toBe(true);
 });
 it('revoking current leaves a separately named retiring version untouched; unavailable counts cause no write',async()=>{
  const f=await fixture();const rotated=PoolKeyCreationResponse.parse(unwrap(await f.rotate()));if(!rotated.keyShown)throw new Error('Not issued');
  f.affected.mockResolvedValueOnce(err(new DomainError('dependency_unavailable','Presence unavailable.')));
  expect(await f.revoke(rotated.keyVersion)).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});
  expect(await f.verifier.verify(rotated.key)).toMatchObject({ok:true});
  unwrap(await f.revoke(rotated.keyVersion));
  expect(await f.verifier.verify(rotated.key)).toEqual({ok:false,reason:'revoked'});
  expect(await f.verifier.verify(f.initial.key)).toMatchObject({ok:true,keyState:'retiring'});
 });
 it('concurrent rotations install exactly one new version',async()=>{
  const f=await fixture();const outcomes=await Promise.all([f.rotate(),f.rotate()]);expect(outcomes.filter(r=>r.ok)).toHaveLength(1);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT state FROM pool_key WHERE pool_id=$1 ORDER BY state',[f.pool]))).toEqual([{state:'current'},{state:'retiring'}]);
 });
 it('uses the bounded project grace setting and rejects malformed and unknown credentials',async()=>{
  const f=await fixture();await withPlatform(tx=>tx.query('UPDATE project SET settings=$2::jsonb WHERE id=$1',[f.ctx.projectId,JSON.stringify({poolKeyGraceSeconds:3600})]));
  unwrap(await f.rotate());f.clock.advance(3600000);expect(await f.verifier.verify(f.initial.key)).toEqual({ok:false,reason:'expired'});
  for(const value of [3599,604801,3600.5,null,'3600'])await expect(withPlatform(tx=>tx.query('UPDATE project SET settings=$2::jsonb WHERE id=$1',[f.ctx.projectId,JSON.stringify({poolKeyGraceSeconds:value})]))).rejects.toBeDefined();
  expect(await f.verifier.verify('bad')).toEqual({ok:false,reason:'malformed'});expect(await f.verifier.verify('opk_live_'+'Z'.repeat(22))).toEqual({ok:false,reason:'unknown'});
 });
 it('does not expose or mutate keys across projects',async()=>{
  const f=await fixture(),other=await bulkFixture(0);
  expect(await f.service.execute(other.ctx,{kind:'rotate',poolId:f.pool},randomUUID())).toMatchObject({ok:false,error:{code:'not_found'}});
  expect(await f.service.affected(other.ctx,f.pool,unwrap(poolKeyId(f.initial.keyVersion)))).toMatchObject({ok:false,error:{code:'not_found'}});
  expect(await f.verifier.verify(f.initial.key)).toMatchObject({ok:true});
 });
 it('I-001/I-003/I-017 HTTP requires idempotency and permission, returns plaintext only on initial issuance',async()=>{
  const f=await fixture();const errors:unknown[]=[];
  let permitted=true;
  const server=createHttpServer(poolKeyRoutes(f.service),{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async request=>({...await allowBulk.check(request),allowed:permitted})}},logger:{error:e=>errors.push(e)}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');const base=`http://127.0.0.1:${address.port}/api/v1`;
  const post=(path:string,body:unknown,key:string|undefined=randomUUID())=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
  try{
   expect((await post(`/projects/${f.ctx.projectId}/pools`,{name:'HTTP'},'')).status).toBe(400);
   const key=randomUUID(),path=`/projects/${f.ctx.projectId}/pools`;
   const response=await post(path,{name:'HTTP'},key);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
   const initial=PoolKeyCreationResponse.parse(await response.json());expect(initial.keyShown).toBe(true);
   const replay=await post(path,{name:'HTTP'},key);expect(replay.status).toBe(200);expect(await replay.json()).toEqual({...initial,key:undefined,keyShown:false});
   expect((await post(path,{name:'Other'},key)).status).toBe(409);
   const affected=await fetch(`${base}/pools/${f.pool}/keys/${f.initial.keyVersion}/affected-agents?projectId=${f.ctx.projectId}`);expect(affected.status).toBe(200);expect(await affected.json()).toMatchObject({affectedAgentCount:20});
   expect((await post(`/pools/${f.pool}/keys/revoke`,{projectId:f.ctx.projectId,keyVersion:f.initial.keyVersion,confirmation:'wrong'})).status).toBe(400);
   const revoked=await post(`/pools/${f.pool}/keys/revoke`,{projectId:f.ctx.projectId,keyVersion:f.initial.keyVersion,confirmation:'Reporting'});expect(revoked.status).toBe(200);expect(await revoked.json()).not.toHaveProperty('key');
   permitted=false;expect((await post(path,{name:'HTTP'},key)).status).toBe(404);
   expect(errors).toEqual([]);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 });
});
