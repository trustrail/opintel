import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { describe,expect,it,vi } from 'vitest';
import { presenceFixture,unwrap } from './fixtures/agent-presence/fixture.js';
import { withTenant,withPlatform } from '../src/platform/db/scope.js';
import { sweepAgentPresence } from '../src/modules/pools/index.js';
import { agentPresenceRoutes } from '../src/modules/pools/api/presence-routes.js';
import { poolKeyRoutes } from '../src/modules/pools/api/key-routes.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { allowBulk } from './fixtures/bulk-entitlements/fixture.js';
import { createRedisConnection } from '../src/platform/redis/index.js';
import { RedisProjectHub } from '../src/platform/sse/redis-hub.js';
import { type StreamEvent } from '../src/shared/api/stream.js';

describe('5.4 agent presence',{timeout:30_000},()=>{
 it('I-018: connecting → active → idle → stale → disconnected after SIGKILL',async()=>{
  const f=await presenceFixture();
  // Test transport stops abruptly; the production MCP transport is item 5.5.
  const child=spawn(process.execPath,['-e',"process.send('ready');process.on('message',m=>process.send(m));setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});
  try{
   await once(child,'message');unwrap(await f.signal('connect'));expect(await f.state()).toBe('connecting');
   const request=once(child,'message');child.send('request');await request;unwrap(await f.signal('request'));expect(await f.state()).toBe('active');
   f.clock.advance(20000);const heartbeat=once(child,'message');child.send('heartbeat');await heartbeat;unwrap(await f.signal('heartbeat'));
   const exit=once(child,'exit');child.kill('SIGKILL');expect((await exit)[1]).toBe('SIGKILL');
   f.clock.advance(39999);await f.repository.sweep(f.ctx);expect(await f.state()).toBe('active');
   f.clock.advance(1);await f.repository.sweep(f.ctx);expect(await f.state()).toBe('idle');
   f.clock.advance(19999);await f.repository.sweep(f.ctx);expect(await f.state()).toBe('idle');
   f.clock.advance(1);await f.repository.sweep(f.ctx);expect(await f.state()).toBe('stale');
   expect((await f.list())[0]!.staleAt).toBe('2026-01-01T00:01:20.000Z');
   f.clock.advance(299999);await f.repository.sweep(f.ctx);expect(await f.state()).toBe('stale');
   f.clock.advance(1);await f.repository.sweep(f.ctx);expect(await f.state()).toBe('disconnected');
   expect(await withTenant(f.ctx,tx=>tx.query('SELECT state FROM agent_presence WHERE pool_id=$1',[f.pool]))).toEqual([{state:'disconnected'}]);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
 });
 it('I-019: delayed sweeps use the original deadlines and never delete disconnected twins',async()=>{
  const f=await presenceFixture();const first=unwrap(await f.signal('request'));f.clock.advance(7*86400000);
  expect(await f.state()).toBe('disconnected');
  await sweepAgentPresence(f.repository);await f.repository.sweep(f.ctx);
  expect(await f.list()).toEqual([{...first,state:'disconnected',staleAt:'2026-01-01T00:01:00.000Z'}]);
  await expect(withTenant(f.ctx,tx=>tx.query('DELETE FROM agent_presence WHERE pool_id=$1',[f.pool]))).rejects.toMatchObject({code:'42501'});
 });
 it('I-020: stale and disconnected reconnect to the same twin; concurrent reconnects increment once',async()=>{
  const f=await presenceFixture();const first=unwrap(await f.signal('request'));
  f.clock.advance(60000);await f.repository.sweep(f.ctx);
  const outcomes=await Promise.all([f.signal('connect'),f.signal('connect')]);expect(outcomes.every(result=>result.ok)).toBe(true);
  expect(await f.list()).toHaveLength(1);expect((await f.list())[0]).toMatchObject({firstSeen:first.firstSeen,state:'connecting',reconnects:1,verified:false});
  unwrap(await f.signal('request'));expect(await f.state()).toBe('active');
  f.clock.advance(360000);unwrap(await f.signal('request'));expect((await f.list())[0]).toMatchObject({firstSeen:first.firstSeen,reconnects:2,state:'active'});
 });
 it('I-021: missing or empty claimed id is refused naming the header; all supplied ids remain unverified',async()=>{
  const f=await presenceFixture();
  for(const agentId of [undefined,'','   '])expect(await f.service.observeAuthenticated(f.ctx,f.auth,{kind:'request',agentId})).toMatchObject({ok:false,error:{code:'validation_failed',message:expect.stringContaining('X-Opintel-Agent-Id')}});
  expect(await f.list()).toEqual([]);
  for(const agentId of ['agent-1','another-caller-claim'])expect(unwrap(await f.signal('request',agentId))).toMatchObject({agentId,verified:false,keyVersion:f.keyVersion});
  const other=await presenceFixture();expect(await f.service.observeAuthenticated(f.ctx,other.auth,{kind:'request',agentId:'agent-1'})).toMatchObject({ok:false,error:{code:'not_found'}});
  expect(await f.repository.list(other.ctx,f.pool,null,10)).toMatchObject({ok:false,error:{code:'not_found'}});
 });
 it('heartbeats preserve liveness without resetting request idleness; settings enforce bounds',async()=>{
  const f=await presenceFixture();unwrap(await f.signal('request'));
  for(let i=0;i<4;i++){f.clock.advance(20000);unwrap(await f.signal('heartbeat'));}
  expect(await f.state()).toBe('idle');expect((await f.list())[0]!.lastRequestAt).toBe('2026-01-01T00:00:00.000Z');
  await withPlatform(tx=>tx.query('UPDATE project SET settings=$2::jsonb WHERE id=$1',[f.ctx.projectId,JSON.stringify({agentHeartbeatSeconds:5,agentDisconnectGraceSeconds:60})]));
  f.clock.advance(15000);expect(await f.state()).toBe('stale');f.clock.advance(60000);expect(await f.state()).toBe('disconnected');
  for(const settings of [{agentHeartbeatSeconds:4},{agentHeartbeatSeconds:61},{agentHeartbeatSeconds:5.5},{agentHeartbeatSeconds:null},{agentDisconnectGraceSeconds:59},{agentDisconnectGraceSeconds:3601}])await expect(withPlatform(tx=>tx.query('UPDATE project SET settings=$2::jsonb WHERE id=$1',[f.ctx.projectId,JSON.stringify(settings)]))).rejects.toBeDefined();
 });
 it('key revocation counts current presence on the last authenticated version and reports disconnected agents separately',async()=>{
  const f=await presenceFixture();unwrap(await f.signal('request','past'));f.clock.advance(360000);await f.repository.sweep(f.ctx);
  unwrap(await f.signal('request','stale'));f.clock.advance(60000);
  unwrap(await f.signal('request','idle'));f.clock.advance(40000);unwrap(await f.signal('heartbeat','idle'));f.clock.advance(20000);
  unwrap(await f.signal('connect','connecting'));unwrap(await f.signal('request','active'));unwrap(await f.signal('request','moved'));
  expect((await f.list()).map(r=>[r.agentId,r.state])).toEqual([['active','active'],['connecting','connecting'],['idle','idle'],['moved','active'],['past','disconnected'],['stale','stale']]);
  const next=await f.rotate();unwrap(await f.signal('request','moved',next));
  expect(unwrap(await f.repository.affected(f.ctx,f.pool,f.keyVersion))).toEqual({affectedAgentCount:4,affectedAgents:['active','connecting','idle','stale'],previouslySeenAgents:['past']});
  expect(unwrap(await f.repository.affected(f.ctx,f.pool,next))).toEqual({affectedAgentCount:1,affectedAgents:['moved'],previouslySeenAgents:[]});
  const revoked=unwrap(await f.keys.execute(f.ctx,{kind:'revoke',poolId:f.pool,keyVersion:f.keyVersion,confirmation:'Presence pool'},randomUUID()));
  expect(revoked).toMatchObject({affectedAgentCount:4,previouslySeenAgents:['past']});
  expect(await f.signal('heartbeat','active')).toMatchObject({ok:false,error:{code:'unauthenticated'}});
  expect((await f.signal('request','moved',next)).ok).toBe(true);
 });
 it('concurrent revocations use the locked transaction for counts without nested database scopes',async()=>{
  const f=await presenceFixture();unwrap(await f.signal('request'));
  const scoped=vi.spyOn(f.repository,'affectedInScope'),independent=vi.spyOn(f.repository,'affected');
  const results=await Promise.all(Array.from({length:12},()=>f.keys.execute(f.ctx,{kind:'revoke',poolId:f.pool,keyVersion:f.keyVersion,confirmation:'Presence pool'},randomUUID())));
  expect(results.filter(result=>result.ok)).toHaveLength(1);expect(scoped).toHaveBeenCalledTimes(1);expect(independent).not.toHaveBeenCalled();
  expect(results.find(result=>result.ok)).toMatchObject({ok:true,value:{affectedAgentCount:1}});
 });
 it('presence API preserves disconnected rows across cursor pages and the key route uses real counts',async()=>{
  const f=await presenceFixture();unwrap(await f.signal('request','a'));f.clock.advance(360000);unwrap(await f.signal('request','b'));
  const server=createHttpServer([...agentPresenceRoutes(f.service),...poolKeyRoutes(f.keys)],{authorization:{currentUser:async()=>f.actor,port:allowBulk}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');const base=`http://127.0.0.1:${address.port}/api/v1/pools/${f.pool}`;
  try{
   const first=await fetch(`${base}/agents?projectId=${f.ctx.projectId}&limit=1`);expect(first.status).toBe(200);const page=await first.json() as {items:{agentId:string;state:string}[];nextCursor:string};expect(page.items).toMatchObject([{agentId:'a',state:'disconnected'}]);
   const next=await fetch(`${base}/agents?projectId=${f.ctx.projectId}&limit=1&cursor=${encodeURIComponent(page.nextCursor)}`);expect(await next.json()).toMatchObject({items:[{agentId:'b',state:'active'}],nextCursor:null});
   const revoke=await fetch(`${base}/keys/revoke`,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({projectId:f.ctx.projectId,keyVersion:f.keyVersion,confirmation:'Presence pool'})});expect(revoke.status).toBe(200);expect(await revoke.json()).toMatchObject({affectedAgentCount:1,affectedAgents:['b'],previouslySeenAgents:['a']});
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 });
 it('presence changes publish after commit; a failed SSE publication cannot roll back presence',async()=>{
  const publish=vi.fn(async()=>{}),f=await presenceFixture({publish});
  publish.mockImplementation(async()=>{expect(await withTenant(f.ctx,tx=>tx.query('SELECT agent_id FROM agent_presence WHERE pool_id=$1',[f.pool]))).toHaveLength(1);});
  unwrap(await f.signal('request'));expect(publish).toHaveBeenLastCalledWith(f.ctx.projectId,{type:'agent.presence',poolId:f.pool,agentId:'agent-1'});
  publish.mockRejectedValueOnce(new Error('Redis unavailable'));const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{f.clock.advance(60000);await f.repository.sweep(f.ctx);expect(await f.state()).toBe('stale');}finally{warn.mockRestore();}
 });
 it('SSE Redis fan-out isolates projects and includes presence in reconnect snapshots',async()=>{
  const url=process.env.REDIS_URL!;const connection=createRedisConnection({url});await connection.connect();const hub=new RedisProjectHub(connection.client,url);
  const f=await presenceFixture(hub),other=await presenceFixture(hub),events:StreamEvent[]=[];
  try{
   const close=await hub.subscribe(f.ctx.projectId,event=>events.push(event),()=>{});
   expect(events[0]).toMatchObject({type:'snapshot',invalidate:expect.arrayContaining(['agentPresence'])});
   unwrap(await other.signal('request'));unwrap(await f.signal('request'));
   await vi.waitFor(()=>expect(events).toHaveLength(2));expect(events[1]).toMatchObject({type:'agent.presence',poolId:f.pool,agentId:'agent-1'});
   await close();f.clock.advance(360000);await f.repository.sweep(f.ctx);
   const reconnect:StreamEvent[]=[];await hub.subscribe(f.ctx.projectId,event=>reconnect.push(event),()=>{});expect(reconnect).toHaveLength(1);expect(reconnect[0]?.type).toBe('snapshot');expect(await f.state()).toBe('disconnected');
  }finally{await hub.close();await connection.close();}
 });
});
