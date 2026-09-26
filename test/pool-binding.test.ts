import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { z } from 'zod';
import { bulkFixture } from './fixtures/bulk-entitlements/fixture.js';
import { InfoPoolAccessRefusals,PoolBindingService,PoolElementResolver,PostgresPoolBindings,PoolKeyService,PostgresPoolKeys,PostgresKeyVerifier,poolKeyId,type PoolAccessRefusals } from '../src/modules/pools/index.js';
import { RelationshipOutbox } from '../src/modules/tenancy/index.js';
import { SpiceDbAuthorizationPort } from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import { PoolId,SystemClock,ok,type Result } from '../src/shared/kernel/index.js';
import { withPlatform,withTenant } from '../src/platform/db/scope.js';
import { createHttpServer,defineRoute,errorEnvelopeSchema } from '../src/platform/http/index.js';
import { PoolKeyCreationResponse } from '../src/shared/api/pool-keys.js';
function unwrap<T>(r:Result<T>):T {if(!r.ok)throw new Error(r.error.message);return r.value;}
const ports:SpiceDbAuthorizationPort[]=[];
afterEach(()=>{for(const p of ports.splice(0))p.close();});
async function fixture(){
 const f=await bulkFixture(1),clock=new SystemClock();
 const authorization=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock,stalenessCeilingMs:10000});ports.push(authorization);
 await authorization.loadSchema(await readFile('docs/opintel-schema.zed','utf8'));
 await authorization.write([{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}}]);
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 const keys=new PoolKeyService(new PostgresPoolKeys(),{affected:async()=>ok({affectedAgents:[],affectedAgentCount:0})});
 const issued=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'create',name:'Binding pool'},randomUUID())));if(!issued.keyShown)throw new Error('No issued key');
 const pool=PoolId(issued.poolId),element=f.ids[0]!;
 const outbox=new RelationshipOutbox(),repository=new PostgresPoolBindings(outbox),service=new PoolBindingService(repository,outbox,authorization);
 const record=vi.fn<PoolAccessRefusals['record']>(async()=>{});
 const resolver=new PoolElementResolver(new PostgresKeyVerifier(),repository,authorization,{record});
 const decide=(treatment='clear')=>withTenant(f.ctx,tx=>tx.query(`INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref,mask_kind)
 VALUES($1,$2,$3,$4,'user',$5,CASE WHEN $4='masked' THEN 'all' ELSE NULL END) ON CONFLICT(pool_id,element_id) DO UPDATE SET treatment=EXCLUDED.treatment,mask_kind=EXCLUDED.mask_kind`,[pool,element,f.ctx.projectId,treatment,f.ctx.userId]));
 return {...f,otherPool:f.pool,pool,element,issued,keys,authorization,outbox,repository,service,resolver,record,decide};
}
describe('5.3 binding and treatment resolution',{timeout:30_000},()=>{
 it('both checks on every resolution: binding alone and entitlement alone cannot authorize',async()=>{
  const f=await fixture();const checks=vi.spyOn(f.authorization,'checkMany'),reads=vi.spyOn(f.repository,'element');
  const resolve=()=>f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear');
  await f.decide();expect(await resolve()).toMatchObject({ok:false,error:{code:'forbidden'}});
  unwrap(await f.service.set(f.ctx,f.pool,f.source,true));
  expect(await resolve()).toMatchObject({ok:true,value:{treatment:'clear',poolId:f.pool}});
  await f.decide('withheld');expect(await resolve()).toMatchObject({ok:false,error:{code:'element_withheld'}});
  await f.decide('tokenized');expect(await resolve()).toMatchObject({ok:false,error:{code:'forbidden'}});
  expect(await f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'tokenized')).toMatchObject({ok:true,value:{treatment:'tokenized'}});
  expect(reads).toHaveBeenCalledTimes(5);
  expect(checks.mock.calls.filter(([requests])=>requests[0]?.permission==='reachable')).toHaveLength(5);
  for(const [requests] of checks.mock.calls.filter(([requests])=>requests[0]?.permission==='reachable'))expect(requests).toEqual([{resource:{type:'datasource',id:f.source},permission:'reachable',subject:{type:'pool',id:f.pool}}]);
  expect(f.record).toHaveBeenCalledTimes(3);
 });
 it('bound but undecided refuses; another pool or source cannot supply the entitlement',async()=>{
  const f=await fixture();unwrap(await f.service.set(f.ctx,f.pool,f.source,true));
  expect(await f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear')).toMatchObject({ok:false,error:{code:'entitlement_missing'}});
  await withTenant(f.ctx,tx=>tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[f.otherPool,f.element,f.ctx.projectId,f.ctx.userId]));
  expect(await f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear')).toMatchObject({ok:false,error:{code:'entitlement_missing'}});
  const other=await bulkFixture(1);
  expect(await f.resolver.resolve(f.ctx,f.issued.key,other.source,other.ids[0]!,'clear')).toMatchObject({ok:false,error:{code:'not_found'}});
  expect(await f.service.set(f.ctx,f.pool,other.source,true)).toMatchObject({ok:false,error:{code:'not_found'}});
  expect(await f.resolver.resolve(other.ctx,f.issued.key,other.source,other.ids[0]!,'clear')).toMatchObject({ok:false,error:{code:'unauthenticated'}});
 });
 it('a local binding and entitlement do not grant access before graph delivery',async()=>{
  const f=await fixture();await f.decide();const pending=unwrap(await f.repository.set(f.ctx,f.pool,f.source,true));
  expect(await f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear')).toMatchObject({ok:false,error:{code:'forbidden'}});
  for(const id of pending)await f.outbox.dispatchOne(f.authorization,id);
  for(const treatment of ['clear','tokenized','masked','aggregate_only'] as const){
   await f.decide(treatment);expect(await f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,treatment)).toMatchObject({ok:true,value:{treatment}});
  }
 });
 it('refusal records use info and contain identifiers and reasons, never a credential',async()=>{
  const f=await fixture();const info=vi.spyOn(console,'info').mockImplementation(()=>{});
  try{
   const resolver=new PoolElementResolver(new PostgresKeyVerifier(),f.repository,f.authorization,new InfoPoolAccessRefusals());
   await resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear');
   expect(info).toHaveBeenCalledExactlyOnceWith({event:'pool.access_refused',poolId:f.pool,sourceId:f.source,elementId:f.element,reason:'forbidden'});
   expect(JSON.stringify(info.mock.calls)).not.toContain(f.issued.key);
  }finally{info.mockRestore();}
 });
 it('bind commits structural row and all three outbox edges; project subjects dispatch correctly',async()=>{
  const f=await fixture();unwrap(await f.service.set(f.ctx,f.pool,f.source,true));
  const rows=await withPlatform(tx=>tx.query<{relation:string;subject_type:string;written_at:Date|null}>("SELECT relation,subject_type,written_at FROM relationship_outbox WHERE resource_id=$1 OR (resource_id=$2 AND subject_id=$1) ORDER BY id",[f.pool,f.source]));
  expect(rows.map(r=>[r.relation,r.subject_type,!!r.written_at])).toEqual([['project','project',true],['bound_pool','pool',true]]);
  const results=await f.authorization.checkMany([{resource:{type:'pool',id:f.pool},permission:'view',subject:{type:'user',id:f.ctx.userId}},{resource:{type:'datasource',id:f.source},permission:'view',subject:{type:'user',id:f.ctx.userId}}]);expect(results.every(r=>r.allowed)).toBe(true);
  await f.decide();unwrap(await f.service.set(f.ctx,f.pool,f.source,false));
  expect(await f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear')).toMatchObject({ok:false,error:{code:'forbidden'}});
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT treatment FROM entitlement WHERE pool_id=$1',[f.pool]))).toEqual([{treatment:'clear'}]);
 });
 it('SpiceDB failure leaves durable pending work; local unbind immediately refuses a stale graph grant',async()=>{
  const f=await fixture();await f.decide();unwrap(await f.service.set(f.ctx,f.pool,f.source,true));
  const write=vi.spyOn(f.authorization,'write').mockRejectedValueOnce(new Error('offline'));
  expect(await f.service.set(f.ctx,f.pool,f.source,false)).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});
  expect(await f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear')).toMatchObject({ok:false,error:{code:'forbidden'}});
  const pending=await withPlatform(tx=>tx.query<{id:string;attempts:number}>("SELECT id,attempts FROM relationship_outbox WHERE subject_id=$1 AND written_at IS NULL",[f.pool]));expect(pending).toHaveLength(1);expect(pending[0]!.attempts).toBe(1);
  write.mockRestore();await f.outbox.dispatchOne(f.authorization,BigInt(pending[0]!.id));
  expect((await f.authorization.checkMany([{resource:{type:'datasource',id:f.source},permission:'reachable',subject:{type:'pool',id:f.pool}}]))[0]!.allowed).toBe(false);
 });
 it('an old touch cannot be dispatched after its newer delete; rollback enqueues nothing',async()=>{
  const f=await fixture();const touch=unwrap(await f.repository.set(f.ctx,f.pool,f.source,true));const deletion=unwrap(await f.repository.set(f.ctx,f.pool,f.source,false));
  expect(await f.outbox.dispatchOne(f.authorization,deletion[0]!)).toBeNull();
  for(const id of touch)await f.outbox.dispatchOne(f.authorization,id);
  await f.outbox.dispatchOne(f.authorization,deletion[0]!);
  expect(await f.outbox.dispatchOne(f.authorization,touch.at(-1)!)).toBeNull();
  expect((await f.authorization.checkMany([{resource:{type:'datasource',id:f.source},permission:'reachable',subject:{type:'pool',id:f.pool}}]))[0]!.allowed).toBe(false);
  await expect(withTenant(f.ctx,async tx=>{await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[f.pool,f.source,f.ctx.projectId]);await f.outbox.enqueuePoolBinding(tx,f.pool,f.source,true);throw new Error('rollback');})).rejects.toThrow('rollback');
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT * FROM pool_source_binding WHERE pool_id=$1',[f.pool]))).toEqual([]);
  expect(await withPlatform(tx=>tx.query('SELECT id FROM relationship_outbox WHERE subject_id=$1 AND written_at IS NULL',[f.pool]))).toEqual([]);
 });
 it('operators cannot widen binding; graph infrastructure failures never return a grant',async()=>{
  const f=await fixture();await f.authorization.write([{operation:'delete',resource:{type:'project',id:f.ctx.projectId},relation:'admin',subject:{type:'user',id:f.ctx.userId}},{operation:'touch',resource:{type:'project',id:f.ctx.projectId},relation:'operator',subject:{type:'user',id:f.ctx.userId}}]);
  expect(await f.service.set(f.ctx,f.pool,f.source,true)).toMatchObject({ok:false,error:{code:'forbidden'}});
  vi.spyOn(f.authorization,'checkMany').mockRejectedValueOnce(new Error('offline'));
  await expect(f.resolver.resolve(f.ctx,f.issued.key,f.source,f.element,'clear')).rejects.toThrow('offline');
 });
 it('I-005/I-006: invalid and revoked keys produce identical 401 envelopes before either data check',async()=>{
  const f=await fixture();unwrap(await f.keys.execute(f.ctx,{kind:'revoke',poolId:f.pool,keyVersion:unwrap(poolKeyId(f.issued.keyVersion)),confirmation:'Binding pool'},randomUUID()));
  const checks=vi.spyOn(f.authorization,'checkMany'),read=vi.spyOn(f.repository,'element');
  // Test-only transport exercises the existing error envelope. MCP is item 5.5.
  const route=defineRoute({method:'POST',path:'/resolve',params:z.object({}),request:z.object({key:z.string()}),response:errorEnvelopeSchema,permission:'public',handle:async r=>{const result=await f.resolver.resolve(f.ctx,r.body.key,f.source,f.element,'clear');if(!result.ok)throw result.error;throw new Error('Unexpected success');}});
  const server=createHttpServer([route],{requestIdFactory:()=> 'fixed-request'});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
  try{
   const bodies:unknown[]=[];
   for(const key of ['bad','opk_live_'+'Z'.repeat(22),f.issued.key]){const response=await fetch(`http://127.0.0.1:${address.port}/resolve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});expect(response.status).toBe(401);bodies.push(await response.json());}
   expect(bodies[1]).toEqual(bodies[0]);expect(bodies[2]).toEqual(bodies[0]);expect(JSON.stringify(bodies)).not.toContain(f.pool);expect(JSON.stringify(bodies)).not.toContain(f.issued.key);
   expect(checks).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(f.record.mock.calls.map(([record])=>record.reason)).toEqual(['key_malformed','key_unknown','key_revoked']);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 });
});
