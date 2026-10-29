import {randomUUID} from 'node:crypto';
import {it,expect,vi} from 'vitest';
import {PostgresEvidenceWriter} from '../src/modules/evidence/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {RunId,type ProjectId} from '../src/shared/kernel/index.js';
import {changeEventSchema,type ProjectChange} from '../src/shared/api/stream.js';
import {queryFixture} from './fixtures/query/fixture.js';
it('LIVE-001: minimal run.completed is sent only after the completion is visible in another transaction',async()=>{
 const events:Array<{project:ProjectId;event:ProjectChange}>=[];
 const writer=new PostgresEvidenceWriter({publish:async(project,event)=>{
  expect(event.type).toBe('run.completed');if(event.type!=='run.completed')throw new Error('Unexpected event');
  const rows=await withTenant(f.ctx,tx=>tx.query<{kind:string;at:string}>("SELECT outcome->>'kind' AS kind,to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS at FROM run_completion WHERE run_id=$1",[event.runId]));
  expect(rows).toEqual([{kind:event.outcome,at:event.at}]);events.push({project,event});
 }});
 const f=await queryFixture(writer);
 try{
  expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);
  expect((await f.query('SELECT field_5 FROM warehouse.public.records')).isError).toBe(true);
  expect(events).toHaveLength(2);for(const {project,event} of events){expect(project).toBe(f.ctx.projectId);expect(Object.keys(event).sort()).toEqual(['at','outcome','poolId','runId','type']);expect(changeEventSchema.parse({...event,sequence:1})).toMatchObject({poolId:f.pool});}
  expect(events.map(e=>e.event.type==='run.completed'?e.event.outcome:null)).toEqual(['answered','refused']);
  const missing=await writer.close(RunId(randomUUID()),{kind:'refused',code:'sql_not_permitted',tokenKeyVersionUsed:null,sourceIdsReached:[]},{pool:{id:f.pool,projectId:f.ctx.projectId},scopeUserId:f.ctx.userId,agentId:'unverified-agent',keyPrefix:'test'});
  expect(missing.ok).toBe(false);expect(events).toHaveLength(2);
 }finally{await f.close();}
});
it('LIVE-002: strict event rejects receipt content and publish outages cannot turn committed answers into failures',async()=>{
 const event={type:'run.completed',sequence:1,runId:randomUUID(),poolId:randomUUID(),outcome:'answered',at:new Date().toISOString()};
 expect(changeEventSchema.safeParse(event).success).toBe(true);
 for(const extra of [{sql:'private'},{agentId:'self-claimed'},{credentialLabel:'private'},{rows:[]},{outcome:{kind:'answered',rowCount:10}}])expect(changeEventSchema.safeParse({...event,...extra}).success).toBe(false);
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),writer=new PostgresEvidenceWriter({publish:async()=>{throw new Error('Redis unavailable');}}),f=await queryFixture(writer);
 try{expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);expect(warn).toHaveBeenCalledWith(expect.objectContaining({event:'sse.publish_failed'}));}finally{await f.close();warn.mockRestore();}
});
