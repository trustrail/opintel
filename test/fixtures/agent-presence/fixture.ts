import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { bulkFixture } from '../bulk-entitlements/fixture.js';
import { withPlatform } from '../../../src/platform/db/scope.js';
import { PoolId,TestClock,type Result } from '../../../src/shared/kernel/index.js';
import { AgentPresenceService,PostgresAgentPresence,PostgresPoolKeys,PoolKeyService,poolKeyId } from '../../../src/modules/pools/index.js';
import { PoolKeyCreationResponse } from '../../../src/shared/api/pool-keys.js';
import type { ProjectEvents } from '../../../src/platform/sse/port.js';
export function unwrap<T>(value:Result<T>):T{if(!value.ok)throw new Error(value.error.message);return value.value;}
export async function presenceFixture(events:ProjectEvents={publish:vi.fn(async()=>{})}){
 const f=await bulkFixture(0),clock=new TestClock();
 await withPlatform(async tx=>{
  await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]);
  await tx.query("INSERT INTO project_member(project_id,user_id,role,granted_by) VALUES($1,$2,'admin',$2)",[f.ctx.projectId,f.ctx.userId]);
 });
 const repository=new PostgresAgentPresence(events,clock),service=new AgentPresenceService(repository),keys=new PoolKeyService(new PostgresPoolKeys(clock),repository);
 const created=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'create',name:'Presence pool'},randomUUID())));if(!created.keyShown)throw new Error('Key not shown');
 const pool=PoolId(created.poolId),keyVersion=unwrap(poolKeyId(created.keyVersion)),auth={poolId:pool,keyVersion};
 const signal=(kind:'connect'|'request'|'heartbeat',agentId='agent-1',version=keyVersion)=>service.observeAuthenticated(f.ctx,{poolId:pool,keyVersion:version},{kind,agentId,client:'test-client'});
 const list=async()=>unwrap(await service.list(f.ctx,pool,null,100));
 const state=async()=> (await list())[0]?.state;
 const rotate=async()=>{const next=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'rotate',poolId:pool},randomUUID())));return unwrap(poolKeyId(next.keyVersion));};
 return {...f,clock,repository,service,keys,created,pool,keyVersion,auth,signal,list,state,rotate,events};
}
