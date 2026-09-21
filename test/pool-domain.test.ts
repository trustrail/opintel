import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { Pool, keyHash, poolKeyId, type PoolState, type KeyRecord } from '../src/modules/pools/index.js';
import { PoolId, ProjectId, PoolName, UserId, Timestamp, type Result } from '../src/shared/kernel/index.js';
const unwrap = <T>(result:Result<T>):T => {if(!result.ok)throw result.error;return result.value;};
const createdAt=Timestamp(new Date('2026-01-01T00:00:00Z'));
const expiry=Timestamp(new Date('2026-01-02T00:00:00Z'));
const base:PoolState={id:PoolId(randomUUID()),projectId:ProjectId(randomUUID()),name:PoolName('Reporting'),boundSources:[],modes:{query:true,prompt:false},clarificationPolicy:'refuse',budgets:{rowsPerDay:1000,rowsPerRequest:100,timeoutMs:1000,memoryMb:128,concurrency:1},keys:[]};
const key=(state:KeyRecord['state']='current',digit='a'):KeyRecord=>({id:unwrap(poolKeyId(randomUUID())),poolId:base.id,projectId:base.projectId,hash:unwrap(keyHash(digit.repeat(64))),prefix:'opk_live_example',state,graceUntil:state==='retiring'||state==='expired'?expiry:null,createdAt,createdBy:UserId(randomUUID())});
it('I-001: empty bindings are valid; only one current and one retiring slot can exist',()=>{
 expect(Pool.create(base).ok).toBe(true);
 expect(Pool.create({...base,keys:[key(),key('current','b')]}).ok).toBe(false);
 expect(Pool.create({...base,keys:[key('retiring'),key('retiring','b')]}).ok).toBe(false);
 expect(Pool.create({...base,keys:[key(),key('retiring','b'),key('expired','c'),key('revoked','d')]}).ok).toBe(true);
 expect(Pool.create({...base,keys:[{...key(),projectId:ProjectId(randomUUID())}]}).ok).toBe(false);
 expect(Pool.create({...base,keys:[{...key(),poolId:PoolId(randomUUID())}]}).ok).toBe(false);
});
it('I-001: grace ends exactly at its deadline, without requiring a persisted expiry sweep',()=>{
 const current=key();const retiring=key('retiring','b');const expired=key('expired','c');const revoked=key('revoked','d');
 const pool=unwrap(Pool.create({...base,keys:[current,retiring,expired,revoked]}));
 expect(pool.keyIsUsable(retiring.id,Timestamp(new Date(Date.parse(expiry)-1)))).toBe(true);
 expect(pool.keyIsUsable(retiring.id,expiry)).toBe(false);
 expect(pool.keyIsUsable(current.id,expiry)).toBe(true);
 expect(pool.keyIsUsable(expired.id,createdAt)).toBe(false);
 expect(pool.keyIsUsable(revoked.id,createdAt)).toBe(false);
 expect(Pool.create({...base,keys:[{...retiring,graceUntil:null}]}).ok).toBe(false);
 expect(Pool.create({...base,keys:[{...retiring,graceUntil:createdAt}]}).ok).toBe(false);
});
it('I-002: aggregate holds digest metadata, protects its snapshot and rejects a complete credential as display prefix',()=>{
 const record=key();const credential='opk_live_'+'A'.repeat(22);
 const keys=[{...record,credential}];const supplied={...base,keys,agents:['self-declared']};
 const pool=unwrap(Pool.create(supplied));keys.length=0;
 expect(JSON.stringify(pool.state)).not.toContain(credential);
 expect(pool.state.keys).toHaveLength(1);expect(Object.isFrozen(pool.state.keys[0])).toBe(true);
 expect(keyHash('opk_live_'+'A'.repeat(22)).ok).toBe(false);
 expect(Pool.create({...base,keys:[{...record,prefix:'opk_live_'+'A'.repeat(22)}]}).ok).toBe(false);
 expect(Object.keys(pool.state)).not.toContain('agents');
});
