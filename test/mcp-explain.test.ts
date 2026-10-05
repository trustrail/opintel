import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplainOutput } from '../src/shared/api/mcp.js';
import { withTenant, withPlatform } from '../src/platform/db/scope.js';
import { UnavailableEvidenceWriter } from './fixtures/query/fixture.js';
import { queryFixture, TestEvidenceWriter } from './fixtures/query/fixture.js';

const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(writer=new TestEvidenceWriter()) {
 const f=await queryFixture(writer);cleanup.push(f.close);
 return {...f,writer,explain:(sql:string)=>f.client.callTool({name:'opintel.explain',arguments:{sql}})};
}
function sourceConnections(f:Awaited<ReturnType<typeof queryFixture>>) {
 return [vi.spyOn(f.sourceScope,'run'),vi.spyOn(f.sourceScope,'external'),vi.spyOn(f.secrets,'resolve'),vi.spyOn(f.stagingSource,'estimate'),vi.spyOn(f.stagingSource,'plain'),vi.spyOn(f.stagingSource,'treated')];
}

describe('5.9 explain through authenticated MCP and pinned sidecar validation',{timeout:60000},()=>{
 it('N-003: reports planned reads and reductions, opens zero source connections and executes no agent SQL',async()=>{
  const f=await fixture();
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='masked',mask_kind='all' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[3]]));
  const connections=sourceConnections(f),execute=vi.spyOn(f.execution,'execute'),validate=vi.spyOn(f.execution,'validate');
  const response=await f.explain('SELECT field_1,field_2,field_4 FROM warehouse.public.records');
  expect(response.isError,JSON.stringify(response)).not.toBe(true);
  const output=ExplainOutput.parse(response.structuredContent);expect(output.permitted).toBe(true);if(!output.permitted)throw new Error(output.reason);
  expect(output.objects).toEqual(['warehouse.public.records']);
  expect(output.columns).toEqual(['field_1','field_2','field_3','field_4'].map(name=>`warehouse.public.records.${name}`));
  expect(output.notes).toContain('Dry run. No source was contacted. Nothing was read.');
  expect(output.notes.some(note=>note.includes('withheld'))).toBe(false);
  expect(output.notes).toContain('Elements that would be returned tokenized: field_2.');
  expect(output.notes).toContain('Elements that would be returned masked: field_4.');
  expect(response.content).toEqual([{type:'text',text:JSON.stringify(output)}]);
  expect(JSON.stringify(response)).not.toMatch(/field_6|secret:\/\/|WITHHELD_SENTINEL|UNDECIDED_SENTINEL|aggregateMinGroupSize|treatmentEvidence|evidenceId/u);
  expect(validate).toHaveBeenCalledOnce();expect(execute).not.toHaveBeenCalled();
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();
  expect(f.boundary.executions).toBe(0);expect(f.writer.records.size).toBe(0);
  // Positive control: the same instrumentation sees source contact by query.
  expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);
  expect(connections[0]).toHaveBeenCalled();expect(f.boundary.executions).toBeGreaterThan(0);
 });
 it('JOIN-006: real explain refuses a cross-object join of derived domains and records both inspection paths without a query run',async()=>{
  const f=await fixture();await f.addSource('second');
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET token_domain=NULL WHERE project_id=$1 AND exposed_name='field_2'",[f.ctx.projectId]));
  const connections=sourceConnections(f),validate=vi.spyOn(f.execution,'validate');
  const sql='SELECT a.field_2 FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2';
  for(const engineOnly of [false,true]){
   if(engineOnly)vi.spyOn(f.filter,'inspect').mockImplementation(async(input,onObject)=>{for(const v of input.views)onObject?.(v);return {ok:true,value:{kind:'requires_sidecar_inspection'}};});
   const before=new Date();const response=await f.explain(sql);
   expect(response).toMatchObject({isError:true,structuredContent:{permitted:false,code:'unsupported_on_token'},_meta:{cause:'unsatisfiable_token_join'}});
   const rows=await withTenant(f.ctx,tx=>tx.query<{operation:string;run_id:null;statement:string;agent_id:string;left_name:string;right_name:string;attempted_at:Date}>('SELECT * FROM token_join_candidate WHERE project_id=$1 ORDER BY attempted_at',[f.ctx.projectId]));
   expect(rows).toHaveLength(engineOnly?2:1);
   expect(rows.at(-1)).toMatchObject({operation:'explain',run_id:null,statement:sql,agent_id:'unverified-agent',left_name:'warehouse.public.records.field_2',right_name:'second.public.records.field_2'});
   expect(rows.at(-1)!.attempted_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
   expect(rows.at(-1)!.attempted_at.getTime()).toBeLessThanOrEqual(Date.now());
  }
  expect(validate).toHaveBeenCalledOnce();for(const spy of connections)expect(spy).not.toHaveBeenCalled();
  expect(f.writer.records.size).toBe(0);expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM query_run WHERE pool_id=$1',[f.pool]))).toEqual([]);
 });
 it('JOIN-006: a failed explain candidate write does not claim the attempt was recorded',async()=>{
  const f=await fixture();await f.addSource('second');await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET token_domain=NULL WHERE project_id=$1 AND exposed_name='field_2'",[f.ctx.projectId]));
  vi.spyOn(f.candidates,'record').mockRejectedValue(new Error('PRIVATE_WRITE_SENTINEL'));
  const response=await f.explain('SELECT a.field_2 FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2');
  expect(response).toMatchObject({isError:true,structuredContent:{permitted:false,code:'dependency_unavailable'}});expect(JSON.stringify(response)).not.toContain('PRIVATE_WRITE_SENTINEL');
 });
 it('N-003: query and explain share refusal codes and exact model text, including sidecar-only refusals',async()=>{
  const f=await fixture(),connections=sourceConnections(f);
  for(const sql of [
   'SELECT field_5 FROM warehouse.public.records',
   'SELECT field_6 FROM warehouse.public.records',
   'SELECT absent FROM warehouse.public.records',
   'SELECT * FROM warehouse.public.absent',
   'SELECT field_2 FROM warehouse.public.records ORDER BY field_2',
   'SELECT field_3 FROM warehouse.public.records',
   'SELECT SUM(field_3+1) FROM warehouse.public.records',
   'SELECT SUM(total) FROM (SELECT SUM(field_3) AS total FROM warehouse.public.records) q',
   "ATTACH 'outside.db' AS outside", 'SELECT FROM',
  ]) {
   const explained=await f.explain(sql),queried=await f.query(sql);
   expect(explained.isError,sql).toBe(true);expect(queried.isError,sql).toBe(true);
   expect(explained.content,sql).toEqual(queried.content);
   expect(explained._meta?.code,sql).toBe(queried._meta?.code);
   expect(explained.structuredContent,sql).toEqual({permitted:false,code:queried._meta?.code,reason:queried.content[0]?.type==='text'?queried.content[0].text:undefined});
   expect(explained._meta).not.toHaveProperty('evidenceId');
  }
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();expect(f.boundary.executions).toBe(0);
 });
 it('N-003: aggregates remain a dry run and expose no thresholds or cardinality verdict',async()=>{
  const f=await fixture(),connections=sourceConnections(f);
  await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{query,aggregateMinGroupSize}',to_jsonb($2::int)) WHERE id=$1",[f.ctx.projectId,937]));
  const response=await f.explain('SELECT field_4,SUM(field_3) FROM warehouse.public.records GROUP BY field_4');
  const output=ExplainOutput.parse(response.structuredContent);expect(output.permitted).toBe(true);if(!output.permitted)throw new Error(output.reason);
  expect(output.notes).toContain('Elements that can only be read in aggregate: field_3.');
  expect(output.notes).toContain('Group sizes must be checked during execution; this dry run does not establish that the groups are large enough.');
  expect(JSON.stringify(response)).not.toMatch(/937|aggregateMinGroupSize|treatmentEvidence/u);
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();expect(f.boundary.executions).toBe(0);
 });
 it('N-003: missing execution limits are named in notes without refusing the dry run or contacting sources',async()=>{
  const f=await fixture(),connections=sourceConnections(f);
  await withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{}]));
  await withTenant(f.ctx,tx=>tx.query('UPDATE pool SET budgets=$2 WHERE id=$1',[f.pool,{}]));
  const execute=vi.spyOn(f.execution,'execute');
  const response=await f.explain('SELECT field_1 FROM warehouse.public.records');
  const output=ExplainOutput.parse(response.structuredContent);
  expect(output.permitted,JSON.stringify(output)).toBe(true);
  if(!output.permitted)throw new Error(output.reason);
  for(const name of ['timeoutSeconds','rowLimit','memoryLimitMb','concurrencyPerPool','threads'])expect(output.notes.some(note=>note.includes(name)&&note.includes('Execution would be refused'))).toBe(true);
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();expect(f.boundary.executions).toBe(0);
  const refused=await f.query('SELECT field_1 FROM warehouse.public.records');
  expect(refused.isError).toBe(true);
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();
 });
 it('N-003: handles CTE lineage, star expansion and source-free VALUES',async()=>{
  const f=await fixture(),connections=sourceConnections(f);
  const cte=ExplainOutput.parse((await f.explain('WITH q AS (SELECT field_2 AS token FROM warehouse.public.records) SELECT token FROM q')).structuredContent);
  expect(cte).toMatchObject({permitted:true,objects:['warehouse.public.records'],notes:expect.arrayContaining(['Elements that would be returned tokenized: field_2.'])});
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='clear' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[2]]));
  const star=ExplainOutput.parse((await f.explain('SELECT * FROM warehouse.public.records')).structuredContent);
  expect(star).toMatchObject({permitted:true,columns:expect.arrayContaining(['warehouse.public.records.field_2']),notes:expect.arrayContaining(['Elements that would be withheld: field_5.'])});
  expect(JSON.stringify(star)).not.toContain('field_6');
  expect(ExplainOutput.parse((await f.explain('VALUES (1)')).structuredContent)).toMatchObject({permitted:true,objects:[],columns:[]});
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();
 });
 it('N-003: remains available with query mode disabled and without the future evidence writer',async()=>{
  const writer=new UnavailableEvidenceWriter(),f=await queryFixture(writer);cleanup.push(f.close);
  await withTenant(f.ctx,tx=>tx.query('UPDATE pool SET mode_query=false WHERE id=$1',[f.pool]));
  const opened=vi.spyOn(writer,'open'),connections=sourceConnections(f);
  expect((await f.client.listTools()).tools.map(tool=>tool.name)).toEqual(['opintel.describe','opintel.explain']);
  const response=await f.client.callTool({name:'opintel.explain',arguments:{sql:'SELECT field_1 FROM warehouse.public.records'}});
  expect(ExplainOutput.parse(response.structuredContent)).toMatchObject({permitted:true});expect(opened).not.toHaveBeenCalled();
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();
 });
 it('N-003: fresh binding and entitlement decisions apply to the next dry run',async()=>{
  const f=await fixture(),sql='SELECT field_1 FROM warehouse.public.records';
  expect((await f.explain(sql)).isError).not.toBe(true);
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='withheld' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
  expect(await f.explain(sql)).toMatchObject({structuredContent:{permitted:false,code:'element_withheld'}});
  await f.authorization.write([{operation:'delete',resource:{type:'datasource',id:f.source},relation:'bound_pool',subject:{type:'pool',id:f.pool}}]);
  expect(await f.explain('SELECT field_4 FROM warehouse.public.records')).toMatchObject({structuredContent:{permitted:false,code:'sql_not_permitted'}});
 });
 it('N-003: a permissive application pre-filter cannot authorize explain',async()=>{
  const f=await fixture(),connections=sourceConnections(f),validate=vi.spyOn(f.execution,'validate');
  vi.spyOn(f.filter,'inspect').mockResolvedValue({ok:true,value:{kind:'requires_sidecar_inspection'}});
  expect(await f.explain("ATTACH 'outside.db' AS outside")).toMatchObject({isError:true,structuredContent:{permitted:false,code:'sql_not_permitted'},_meta:{proofCategory:'serialization_refused'}});
  expect(validate).toHaveBeenCalledOnce();for(const connection of connections)expect(connection).not.toHaveBeenCalled();expect(f.boundary.executions).toBe(0);
 });
 it('N-003: an unavailable sidecar cannot produce a permitted dry run',async()=>{
  const f=await fixture();await f.host.close();
  const explained=await f.explain('SELECT 1'),queried=await f.query('SELECT 1');
  expect(explained).toMatchObject({isError:true,structuredContent:{permitted:false,code:'source_unavailable'}});expect(explained.content).toEqual(queried.content);
 });
 it('N-003: invalid tool arguments preserve the explain refusal contract and query text',async()=>{
  const f=await fixture(),connections=sourceConnections(f),validate=vi.spyOn(f.execution,'validate');
  const args={sql:1};
  const explained=await f.client.callTool({name:'opintel.explain',arguments:args}),queried=await f.client.callTool({name:'opintel.query',arguments:args});
  expect(explained.content).toEqual(queried.content);
  expect(ExplainOutput.parse(explained.structuredContent)).toEqual({permitted:false,code:'validation_failed',reason:'The tool arguments do not match its schema.'});
  expect(validate).not.toHaveBeenCalled();for(const connection of connections)expect(connection).not.toHaveBeenCalled();
 });
 it('N-003: disconnecting explain cancels downstream validation',async()=>{
  const f=await fixture();let started!:()=>void,stopped!:()=>void;
  const beginning=new Promise<void>(resolve=>{started=resolve;}),ended=new Promise<void>(resolve=>{stopped=resolve;});
  const validate=f.execution.validate.bind(f.execution);
  vi.spyOn(f.execution,'validate').mockImplementation(async(request,signal)=>{
   started();await new Promise<void>(resolve=>{if(signal?.aborted)resolve();else signal?.addEventListener('abort',()=>resolve(),{once:true});});
   try{return await validate(request,signal);}finally{stopped();}
  });
  const connections=sourceConnections(f),controller=new AbortController();
  const pending=fetch(f.url,{method:'POST',signal:controller.signal,headers:{authorization:`Bearer ${f.issued.key}`,'x-opintel-agent-id':'unverified-agent','mcp-session-id':f.transport.sessionId!,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:901,method:'tools/call',params:{name:'opintel.explain',arguments:{sql:'SELECT field_1 FROM warehouse.public.records'}}})});
  const settled=pending.catch(error=>error as unknown);await beginning;controller.abort();await settled;await ended;
  for(const connection of connections)expect(connection).not.toHaveBeenCalled();expect(f.boundary.executions).toBe(0);
 });

});
