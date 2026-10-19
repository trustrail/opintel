import {it,expect,vi} from 'vitest';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createObserver} from '../scripts/soak/observer.js';
import {RedisSessionStore,sessionAbsoluteTimeoutMs,sessionIdleTimeoutMs} from '../src/modules/identity/infrastructure/redis-session-store.js';
import {CurrentUserService} from '../src/modules/identity/index.js';
import {createRedisConnection} from '../src/platform/redis/index.js';
import {createHttpServer,defineRoute} from '../src/platform/http/index.js';
import {SessionId,UserId,TestClock,UuidV7IdFactory} from '../src/shared/kernel/index.js';
import {ActivityPage} from '../src/shared/api/activity.js';

/** Only receipt content is a fixture. Heartbeats use real HTTP, the production
 * auth guard and CurrentUserService, and the real Redis session implementation. */
async function fixture(){
 if(!process.env.REDIS_URL)throw new Error('Run through npm test with owned Redis.');
 const redis=createRedisConnection({url:process.env.REDIS_URL});await redis.connect();
 const clock=new TestClock(new Date('2026-01-01T00:00:00.000Z')),user=UserId(randomUUID());
 const store=new RedisSessionStore(redis.client,clock,new UuidV7IdFactory());
 const session=await store.create(user,{ip:'192.0.2.1',userAgent:'observer-regression',deviceNonce:'synthetic'},'magic_link',true);
 const current=new CurrentUserService(store,{findById:async()=>({id:user,email:'observer@example.test',fullName:null,timezone:'UTC'})},{check:async()=>true});
 const project=randomUUID(),statuses:number[]=[];
 const server=createHttpServer([defineRoute({method:'GET',path:'/api/v1/projects/:id/runs',params:z.object({id:z.uuid()}),request:z.undefined(),query:z.object({limit:z.coerce.number().int().positive()}),permission:'authenticated',response:ActivityPage,handle:async()=>({body:{items:[],nextCursor:null}})})],{authorization:{currentUser:async headers=>{
  const value=headers.cookie?.match(/^opintel_session=([^;]+)$/u)?.[1];return value?current.read(SessionId(value)):null;
 }}});
 server.on('request',(_request,response)=>response.once('finish',()=>statuses.push(response.statusCode)));
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('HTTP fixture did not bind.');
 const directory=await mkdtemp(join(tmpdir(),'observer-session-')),file=join(directory,'cookie');await writeFile(file,`opintel_session=${session}`,{mode:0o600});
 let stopped=0;const warnings:string[]=[];const observer=createObserver(new URL(`http://127.0.0.1:${address.port}`),project,file,m=>warnings.push(m),()=>{stopped++;});
 return {clock,store,session,redis,statuses,observer,warnings,stopped:()=>stopped,async close(){await observer.close();vi.useRealTimers();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await store.revoke(session);await redis.close();await rm(directory,{recursive:true,force:true});}};
}
async function until(check:()=>boolean){const end=Date.now()+5000;while(!check()){if(Date.now()>=end)throw new Error('Heartbeat did not complete.');await new Promise(resolve=>setTimeout(resolve,5));}}

it('observer receipt heartbeats refresh idle activity but fail at absolute expiry and cannot resurrect the session',async()=>{
 const f=await fixture();
 try{
  // Model legitimate earlier activity; retain creation time and the real cap.
  const target=sessionAbsoluteTimeoutMs-95000,interval=sessionIdleTimeoutMs-60000;let elapsed=0;
  while(elapsed+interval<target){f.clock.advance(interval);elapsed+=interval;await f.store.touch(f.session);}
  f.clock.advance(target-elapsed);await f.store.touch(f.session);
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});await f.observer.ready();expect(f.statuses).toEqual([200]);
  for(let n=0;n<3;n++){
   f.clock.advance(30000);vi.advanceTimersByTime(30000);await until(()=>f.statuses.length===n+2);
   expect(f.statuses.at(-1)).toBe(200);expect(f.observer.summary().failed).toBe(false);
   expect((await f.store.read(f.session))?.lastSeenAt).toBe(f.clock.now());
  }
  const ttl=await f.redis.client.pTTL('session:'+f.session);expect(ttl).toBeGreaterThan(0);expect(ttl).toBeLessThanOrEqual(5000);
  f.clock.advance(5000);vi.advanceTimersByTime(30000);await until(()=>f.stopped()===1);
  expect(f.statuses.at(-1)).toBe(401);expect(f.observer.summary()).toMatchObject({enabled:false,failed:true});expect(f.warnings[0]).toContain('SOAK FAILED');
  expect(await f.store.read(f.session)).toBeNull();expect(await f.redis.client.exists('session:'+f.session)).toBe(0);
  f.clock.advance(1);vi.advanceTimersByTime(60000);await f.observer.close();
  await expect(f.observer.read(randomUUID(),'synthetic-agent')).rejects.toThrow('401');
  expect(f.statuses).toEqual([200,200,200,200,401]);expect(f.stopped()).toBe(1);expect(await f.store.read(f.session)).toBeNull();
 }finally{await f.close();}
});
it('revoking a live observer session makes the next receipt heartbeat fail, halts the soak and never recreates the session',async()=>{
 const f=await fixture();
 try{
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});await f.observer.ready();
  f.clock.advance(30000);vi.advanceTimersByTime(30000);await until(()=>f.statuses.length===2);expect(f.statuses).toEqual([200,200]);
  await f.store.revoke(f.session);expect(await f.store.read(f.session)).toBeNull();
  f.clock.advance(30000);vi.advanceTimersByTime(30000);await until(()=>f.stopped()===1);
  expect(f.statuses).toEqual([200,200,401]);expect(f.observer.summary()).toMatchObject({enabled:false,failed:true});expect(f.warnings[0]).toContain('SOAK FAILED');
  vi.advanceTimersByTime(60000);await f.observer.close();await expect(f.observer.read(randomUUID(),'synthetic-agent')).rejects.toThrow('401');
  expect(f.statuses).toEqual([200,200,401]);expect(f.stopped()).toBe(1);expect(await f.redis.client.exists('session:'+f.session)).toBe(0);
 }finally{await f.close();}
});
