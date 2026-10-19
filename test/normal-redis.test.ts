import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createClient} from 'redis';
import {freshNormalRedis} from '../scripts/testing/normal-redis.js';
it('normal-test FLUSHDB cannot erase sessions in the caller Redis server',async()=>{
 const caller=createClient({url:process.env.REDIS_URL});caller.on('error',()=>{});await caller.connect();
 const key='observer-isolation:'+randomUUID();const own=await freshNormalRedis();const test=createClient({url:own.url});test.on('error',()=>{});
 try{await test.connect();await caller.set(key,'synthetic-session',{PX:60000});await test.set(key,'disposable-fixture');await test.flushDb();expect(await test.get(key)).toBeNull();expect(await caller.get(key)).toBe('synthetic-session');expect(own.url).not.toBe(process.env.REDIS_URL);}
 finally{await caller.del(key);await caller.close();if(test.isOpen)await test.close();await own.close();}
});
