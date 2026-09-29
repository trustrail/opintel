import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { withTenant, withPlatform } from '../src/platform/db/scope.js';
import { parseQueryRun, type VersionStamp, type RunOutcome } from '../src/modules/evidence/index.js';
import { policyFixture, type PolicyFixture, unwrap } from './fixtures/policy-version/fixture.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';

let f:PolicyFixture;
const now=()=>new Date().toISOString();
type Header={id:string;startedAt:string};
async function open(at=now(),id=randomUUID()):Promise<Header> {
 const versions:VersionStamp={policy:await f.version(),vocabulary:2,catalog:3,tokenKeyVersionSelected:4};
 await withTenant(f.ctx,tx=>tx.query(`INSERT INTO query_run(id,project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at)
 VALUES($1,$2,$3,'claimed-agent','opk_live_prefix','query','SELECT field_1 FROM warehouse.public.records',$4,$5)`,[id,f.ctx.projectId,f.pool,versions,at]));
 return {id,startedAt:at};
}
async function complete(h:Header,outcome:RunOutcome={kind:'answered',rowCount:1,truncated:false}) {
 await withTenant(f.ctx,tx=>tx.query(`INSERT INTO run_completion(run_id,started_at,outcome,cil,source_plan,generated_sql,latency_ms,freshness,synthetic,completed_at)
 VALUES($1,$2,$3,NULL,'{"sources":[]}','SELECT field_1 FROM warehouse.public.records',12,'{"mode":"live"}',false,$2::timestamptz+interval '1 second')`,[h.id,h.startedAt,outcome]));
}
async function read(h:Header) {
 const [row]=await withTenant(f.ctx,tx=>tx.query<{record:unknown}>(`SELECT jsonb_build_object(
 'header',jsonb_build_object('id',r.id,'projectId',r.project_id,'poolId',r.pool_id,'agentId',r.agent_id,'keyPrefix',r.key_prefix,'mode',r.mode,'request',r.request,'versions',r.versions,'startedAt',r.started_at),
 'completion',CASE WHEN c.run_id IS NULL THEN NULL ELSE jsonb_build_object('outcome',c.outcome,'cil',c.cil,'sourcePlan',c.source_plan,'generatedSql',c.generated_sql,'latencyMs',c.latency_ms,'freshness',c.freshness,'synthetic',c.synthetic,'completedAt',c.completed_at) END,
 'elements',COALESCE((SELECT jsonb_agg(jsonb_build_object('elementId',e.element_id,'exposedName',e.exposed_name,'state',e.state,'treatment',e.treatment,'withheldReason',e.withheld_reason) ORDER BY e.exposed_name) FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]'),
 'stages',COALESCE((SELECT jsonb_agg(jsonb_build_object('stage',s.stage,'result',s.result,'detail',s.detail,'ms',s.ms)) FROM run_stage s WHERE s.run_id=r.id AND s.started_at=r.started_at),'[]')) AS record
 FROM query_run r LEFT JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.id=$1 AND r.started_at=$2`,[h.id,h.startedAt]));
 return row?unwrap(parseQueryRun(row.record)):null;
}

describe('5.10 evidence domain and database',{timeout:30000},()=>{
 resetDatabaseBeforeEach('company');
 beforeEach(async()=>{f=await policyFixture(5);});
 it('M-001: a header without completion reads as incomplete, not missing; one completion finishes that record',async()=>{
  const h=await open(),incomplete=await read(h);
  expect(incomplete).not.toBeNull();expect(incomplete?.status).toBe('incomplete');expect(incomplete?.outcome).toBeNull();
  expect(await read({...h,id:randomUUID()})).toBeNull();
  await expect(open(h.startedAt,h.id)).rejects.toMatchObject({code:'23505'});
  await complete(h);expect((await read(h))?.status).toBe('complete');
  await expect(complete(h)).rejects.toMatchObject({code:'23505'});
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM query_run'))).toHaveLength(1);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT run_id FROM run_completion'))).toHaveLength(1);
 });
 it('M-002: snapshots every delivered treatment and distinguishes withheld/undecided without sentinel treatments',async()=>{
  const h=await open();
  await withTenant(f.ctx,async tx=>{
   for(const [index,treatment] of ['clear','tokenized','masked','aggregate_only',null,null].entries()) {
    const state=index===3?'aggregated':index===4?'withheld':index===5?'undecided':'released';
    await tx.query('INSERT INTO run_element(run_id,started_at,element_id,exposed_name,state,treatment,withheld_reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[h.id,h.startedAt,f.ids[index]??null,`field_${index+1}`,state,treatment,index===4?'Explicit pool decision':null]);
   }
   await tx.query("INSERT INTO run_stage(run_id,started_at,stage,result,detail,ms) VALUES($1,$2,'execute','ok','{\"rows\":1}',10)",[h.id,h.startedAt]);
  });
  await complete(h,{kind:'reduced',rowCount:1,truncated:false,withheld:1});
  const run=(await read(h))!;
  expect(run.state.elements.map(e=>[e.state,e.treatment])).toEqual([['released','clear'],['released','tokenized'],['released','masked'],['aggregated','aggregate_only'],['withheld',null],['undecided',null]]);
  expect(run.state.elements[4]?.withheldReason).toBe('Explicit pool decision');
  expect(run.versions).toEqual({policy:1,vocabulary:2,catalog:3,tokenKeyVersionSelected:4});
  expect(run.state.completion).toMatchObject({freshness:{mode:'live'},synthetic:false,latencyMs:12,outcome:{kind:'reduced',withheld:1}});
 });
 it('enforces treatment null if and only if state is withheld or undecided, through direct SQL',async()=>{
  const h=await open();
  for(const [state,treatment] of [['released',null],['aggregated',null],['withheld','clear'],['undecided','tokenized'],['withheld','withheld']]) {
   await expect(withTenant(f.ctx,tx=>tx.query('INSERT INTO run_element(run_id,started_at,exposed_name,state,treatment) VALUES($1,$2,\'field\',$3,$4)',[h.id,h.startedAt,state,treatment]))).rejects.toMatchObject({code:'23514'});
  }
 });
 it('M-003/M-004: UPDATE and DELETE are denied by grants on all evidence tables and direct monthly partitions',async()=>{
  const h=await open();await complete(h);
  await withTenant(f.ctx,tx=>tx.query("INSERT INTO audit_entry(project_id,actor_kind,action,target) VALUES($1,'system','evidence.test','{}')",[f.ctx.projectId]));
  const tables=await withPlatform(tx=>tx.query<{name:string;parent:string|null}>(`SELECT c.relname AS name,p.relname AS parent FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_inherits i ON i.inhrelid=c.oid LEFT JOIN pg_class p ON p.oid=i.inhparent WHERE n.nspname='public' AND (c.relname=ANY($1) OR p.relname=ANY($1))`,[['query_run','run_completion','run_element','run_stage','audit_entry']]));
  const fields:Record<string,string>={query_run:'request',run_completion:'generated_sql',run_element:'exposed_name',run_stage:'stage',audit_entry:'action'};
  for(const table of tables) {
   const field=fields[table.parent??table.name]!;
   for(const sql of [`UPDATE "${table.name}" SET ${field}=${field}`,`DELETE FROM "${table.name}"`,`TRUNCATE "${table.name}"`])await expect(withTenant(f.ctx,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
  }
  expect((await read(h))?.status).toBe('complete');
 });
 it('M-005/M-006: request-start policy stamps survive time and later committed entitlement changes',async()=>{
  const at=new Date(),a=await open(at.toISOString()),b=await open(new Date(at.getTime()+60000).toISOString());
  expect((await read(a))?.versions.policy).toBe((await read(b))?.versions.policy);
  await f.set('withheld');
  const c=await open(new Date(at.getTime()+120000).toISOString());
  await complete(a);await complete(b);await complete(c);
  expect((await read(a))?.versions.policy).toBe(1);expect((await read(b))?.versions.policy).toBe(1);expect((await read(c))?.versions.policy).toBe(2);
 });
 it('child records require the same run and start time; completed aggregates cannot receive more children',async()=>{
  const h=await open();
  await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO run_stage(run_id,started_at,stage,result,ms) VALUES($1,$2::timestamptz+interval '1 second','validate','ok',0)",[h.id,h.startedAt]))).rejects.toMatchObject({code:'42501'});
  await complete(h);
  await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO run_stage(run_id,started_at,stage,result,ms) VALUES($1,$2,'record','ok',0)",[h.id,h.startedAt]))).rejects.toMatchObject({code:'23514'});
  await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO run_element(run_id,started_at,exposed_name,state,treatment) VALUES($1,$2,'late','released','clear')",[h.id,h.startedAt]))).rejects.toMatchObject({code:'23514'});
 });
 it('forces tenant isolation on headers, children, audits and direct partitions',async()=>{
  const h=await open();
  await withTenant(f.ctx,async tx=>{
   await tx.query("INSERT INTO run_element(run_id,started_at,exposed_name,state,treatment) VALUES($1,$2,'field','released','clear')",[h.id,h.startedAt]);
   await tx.query("INSERT INTO run_stage(run_id,started_at,stage,result,ms) VALUES($1,$2,'execute','ok',1)",[h.id,h.startedAt]);
   await tx.query("INSERT INTO audit_entry(project_id,actor_kind,action,target) VALUES($1,'system','tenant.test','{}')",[f.ctx.projectId]);
  });
  await complete(h);
  for(const name of ['query_run','run_completion','run_element','run_stage','audit_entry'])expect(await withTenant(f.ctx,tx=>tx.query(`SELECT * FROM "${name}"`))).toHaveLength(1);
  const other=await policyFixture();
  const tables=await withPlatform(tx=>tx.query<{name:string}>(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_inherits i ON i.inhrelid=c.oid LEFT JOIN pg_class p ON p.oid=i.inhparent WHERE n.nspname='public' AND (c.relname=ANY($1) OR p.relname=ANY($1))`,[['query_run','run_completion','run_element','run_stage','audit_entry']]));
  for(const {name} of tables)expect(await withTenant(other.ctx,tx=>tx.query(`SELECT * FROM "${name}"`))).toEqual([]);
  await expect(withTenant(other.ctx,tx=>tx.query("INSERT INTO run_element(run_id,started_at,exposed_name,state,treatment) VALUES($1,$2,'foreign','released','clear')",[h.id,h.startedAt]))).rejects.toMatchObject({code:'42501'});
  await expect(withTenant(other.ctx,tx=>tx.query("INSERT INTO audit_entry(project_id,actor_kind,action,target) VALUES($1,'system','foreign','{}')",[f.ctx.projectId]))).rejects.toMatchObject({code:'42501'});
  await expect(withTenant(other.ctx,tx=>tx.query('SELECT public.ensure_evidence_month(current_date)'))).rejects.toMatchObject({code:'42501'});
 });
 it('routes header and completion to the start month even when completion crosses a UTC boundary',async()=>{
  const d=new Date(),boundary=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1));
  const h=await open(new Date(boundary.getTime()-500).toISOString());await complete(h);
  const [placement]=await withTenant(f.ctx,tx=>tx.query<{header:string;completion:string}>(`SELECT r.tableoid::regclass::text AS header,c.tableoid::regclass::text AS completion FROM query_run r JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.id=$1`,[h.id]));
  const suffix=h.startedAt.slice(0,7).replace('-','');expect(placement).toEqual({header:`query_run_${suffix}`,completion:`run_completion_${suffix}`});
  expect((await read(h))?.status).toBe('complete');
 });
 it('refuses malformed version stamps, missing outcome fields and completion before start',async()=>{
  const h=await open();
  await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO query_run(project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,'prefix','query','sql','{}',now())",[f.ctx.projectId,f.pool]))).rejects.toMatchObject({code:'23514'});
  for(const [outcome,at] of [[{kind:'answered'},h.startedAt],[{kind:'failed',code:'source_unavailable'},h.startedAt],[{kind:'refused',code:'undecided_element',element:null,stage:null},h.startedAt],[{kind:null},h.startedAt],[{kind:'answered',rowCount:0,truncated:false},new Date(Date.parse(h.startedAt)-1000).toISOString()]]) {
   await expect(withTenant(f.ctx,tx=>tx.query('INSERT INTO run_completion(run_id,started_at,outcome,completed_at) VALUES($1,$2,$3,$4)',[h.id,h.startedAt,outcome,at]))).rejects.toMatchObject({code:'23514'});
  }
 });
});
