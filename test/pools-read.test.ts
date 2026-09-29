import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {PostgresPoolReader} from '../src/modules/pools/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {presenceFixture} from './fixtures/agent-presence/fixture.js';
it('5.14 clear ratio includes undecided and excludes removed elements and archived sources',async()=>{
 const f=await policyFixture(99),read=new PostgresPoolReader();await f.set('clear',randomUUID(),f.ids.slice(0,3));
 expect(unwrap(await read.detail(f.ctx,f.pool))).toMatchObject({clearElements:3,activeElements:99,workingKeys:0});
 await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET status='removed',removed_at=now() WHERE id=$1",[f.ids[0]]));
 expect(unwrap(await read.detail(f.ctx,f.pool))).toMatchObject({clearElements:2,activeElements:98});
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='archived' WHERE id=$1",[f.source]));
 expect(unwrap(await read.detail(f.ctx,f.pool))).toMatchObject({clearElements:0,activeElements:0});
 const other=await policyFixture(0);expect(await read.detail(other.ctx,f.pool)).toMatchObject({ok:false,error:{code:'not_found'}});
});
it('I-019/020: twin retains disconnected last-seen facts; revocation changes key status without rewriting presence',async()=>{
 const f=await presenceFixture(),read=new PostgresPoolReader();const first=unwrap(await f.signal('request','observed'));
 const before=unwrap(await read.twin(f.ctx,f.pool,'observed'));expect(before.presence).toMatchObject({agentId:'observed',state:'disconnected',lastSeen:first.lastSeen,verified:false});
 unwrap(await f.keys.execute(f.ctx,{kind:'revoke',poolId:f.pool,keyVersion:f.keyVersion,confirmation:'Presence pool'},randomUUID()));
 const after=unwrap(await read.twin(f.ctx,f.pool,'observed'));expect(after.presence).toEqual(before.presence);expect(after.keyMetadata.state).toBe('revoked');expect(unwrap(await read.detail(f.ctx,f.pool)).workingKeys).toBe(0);
 const other=await presenceFixture();expect(await read.twin(other.ctx,f.pool,'observed')).toMatchObject({ok:false,error:{code:'not_found'}});
 expect(JSON.stringify(after)).not.toContain(f.created.key);
});
it('pool detail and twin routes authorize project view, hide cross-project rows and expose metadata only',async()=>{
 const {once}=await import('node:events');const {createHttpServer}=await import('../src/platform/http/index.js');const {poolReadRoutes}=await import('../src/modules/pools/api/read-routes.js');const {allowBulk}=await import('./fixtures/bulk-entitlements/fixture.js');
 const f=await presenceFixture(),other=await presenceFixture();unwrap(await f.signal('request','observed'));let allowed=true;
 const server=createHttpServer(poolReadRoutes(new PostgresPoolReader()),{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async request=>{expect(request.permission).toBe('view');expect(request.resource.id).toBe(f.ctx.projectId);return {...await allowBulk.check(request),allowed};}}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 const base=`http://127.0.0.1:${address.port}/api/v1/pools/`;
 try{
  for(const path of [f.pool,`${f.pool}/agents/observed`]){const response=await fetch(`${base}${path}?projectId=${f.ctx.projectId}`);expect(response.status).toBe(200);const body=await response.text();expect(body).not.toContain(f.created.key);expect(body).not.toContain('key_hash');expect(response.headers.get('cache-control')).toBe('no-store');}
  expect((await fetch(`${base}${other.pool}?projectId=${f.ctx.projectId}`)).status).toBe(404);
  allowed=false;expect((await fetch(`${base}${f.pool}/agents/observed?projectId=${f.ctx.projectId}`)).status).toBe(404);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
