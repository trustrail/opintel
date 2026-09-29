import {afterEach,describe,expect,it,vi} from 'vitest';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {RunId,DomainError,err} from '../src/shared/kernel/index.js';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {assertEvidenceWriter} from '../src/modules/mcp/index.js';
import {queryFixture,TestEvidenceWriter,UnavailableEvidenceWriter} from './fixtures/query/fixture.js';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(writer=new TestEvidenceWriter()){const f=await queryFixture(writer);cleanup.push(f.close);return {...f,writer};}
describe('5.7 authenticated query through authoritative sidecar',{timeout:60000},()=>{
 it('K-001: real treated rows and native expression types, evidence before release, and caller row limit',async()=>{
  const f=await fixture(),response=await f.query('SELECT field_1,field_2,field_4 FROM warehouse.public.records ORDER BY field_1',2);
  expect(response.isError,JSON.stringify(response)).not.toBe(true);const output=QueryOutput.parse(response.structuredContent);
  expect(output.columns).toEqual([{name:'field_1',type:'INTEGER'},{name:'field_2',type:'VARCHAR'},{name:'field_4',type:'VARCHAR'}]);expect(output.rows).toHaveLength(2);expect(output.truncated).toBe(true);
  expect(output.rows[0]).toEqual([1,expect.stringMatching(/^v1_customer_/),'large']);
  expect(f.writer.records.get(RunId(output.evidenceId))).toMatchObject({outcome:{kind:'answered',rows:2}});expect(response.content).toEqual([{type:'text',text:'2 rows. The result was truncated at 2 rows; there are more. 1 element was withheld: field_5. field_2 was returned tokenized. Tokens are stable: the same value is always the same token, so they can be grouped and joined, but not ordered or compared.'}]);expect(f.boundary.executions).toBeGreaterThan(0);
  expect(JSON.stringify(response)).not.toMatch(/1001|WITHHELD_SENTINEL|UNDECIDED_SENTINEL/u);
 });
 it('I-009: star names withheld in exact model text while omitting withheld and undecided data',async()=>{
  const f=await fixture();await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='clear' WHERE pool_id=$1 AND element_id=ANY($2::uuid[])",[f.pool,[f.ids[1],f.ids[2]]]));
  const response=await f.query('SELECT * FROM warehouse.public.records ORDER BY field_1');expect(response.isError,JSON.stringify(response)).not.toBe(true);const output=QueryOutput.parse(response.structuredContent);
  expect(output.columns.map(c=>c.name)).toEqual(['field_1','field_2','field_3','field_4']);expect(output.rows[0]).toEqual([1,1001,10,'large']);expect(response.content).toEqual([{type:'text',text:'7 rows. 1 element was withheld: field_5.'}]);expect(JSON.stringify(output)).not.toContain('field_5');expect(JSON.stringify(response)).not.toMatch(/field_6|WITHHELD_SENTINEL|UNDECIDED_SENTINEL/u);
 });
 it('I-010/I-011/I-012: withheld, undecided and absent are distinct recorded refusals',async()=>{
  const f=await fixture();
  for(const [name,code] of [['field_5','element_withheld'],['field_6','entitlement_missing'],['not_here','not_found']]){
   const response=await f.query(`SELECT ${name} FROM warehouse.public.records`);expect(response).toMatchObject({isError:true,_meta:{code,evidenceId:expect.any(String)}});
   expect([...f.writer.records.values()].at(-1)?.outcome).toMatchObject({kind:'refused',code});expect(response.structuredContent).toBeUndefined();
  }
  expect(f.boundary.executions).toBe(0);
 });
 it('K-002/K-003: independent sources join on equal treated tokens without releasing the identifiers',async()=>{
  const f=await fixture(),second=await f.addSource('second'),reads=vi.spyOn(f.stagingSource,'treated');
  const response=await f.query('SELECT a.field_1,a.field_2 FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2 ORDER BY a.field_1');
  expect(response.isError,JSON.stringify(response)).not.toBe(true);const output=QueryOutput.parse(response.structuredContent);expect(output.rows).toHaveLength(7);expect(output.rows.map(r=>r[0])).toEqual([1,2,3,4,5,6,7]);expect(output.rows.every(r=>typeof r[1]==='string'&&r[1].startsWith('v1_customer_'))).toBe(true);
  expect(new Set(reads.mock.calls.map(args=>args[0].object.sourceId))).toEqual(new Set([f.source,second]));
 });
 it('K-004/K-005/K-006: aggregates run, raw aggregate-only values and small groups refuse the whole result',async()=>{
  const f=await fixture();const allowed=await f.query('SELECT SUM(field_3) AS total FROM warehouse.public.records');expect(allowed.isError,JSON.stringify(allowed)).not.toBe(true);expect(QueryOutput.parse(allowed.structuredContent).rows).toEqual([['70']]);
  for(const sql of ['SELECT field_3 FROM warehouse.public.records','SELECT field_4,SUM(field_3) FROM warehouse.public.records GROUP BY field_4']){
   const response=await f.query(sql);expect(response).toMatchObject({isError:true,_meta:{code:'unsupported_on_aggregate_only'}});expect(response.structuredContent).toBeUndefined();
  }
 });
 it('F-010/K-009: after success, an unreachable source refuses with no cached or partial answer',async()=>{
  const f=await fixture();await f.addSource('second');const sql='SELECT a.field_1 FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2';expect((await f.query(sql)).isError).not.toBe(true);
  // Both estimates succeed and the first source is fully staged. Then the
  // second real connector loses connectivity: no first-source rows may escape.
  const loaded:string[]=[],treated=f.stagingSource.treated.bind(f.stagingSource);const reads=vi.spyOn(f.stagingSource,'treated').mockImplementation(async(...args)=>{const result=await treated(...args);if(result.ok){loaded.push(args[0].object.sourceId);vi.spyOn(f.secrets,'resolve').mockResolvedValue('postgres://nobody:secret@127.0.0.1:1/unreachable');}return result;});
  const failed=await f.query(sql);expect(loaded).toHaveLength(1);expect(reads).toHaveBeenCalledTimes(2);expect(failed).toMatchObject({isError:true,_meta:{code:'source_unavailable'}});expect(failed.structuredContent).toBeUndefined();expect(JSON.stringify(failed)).not.toContain('secret');
  await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='unreachable' WHERE id=$1",[f.source]));
  expect(await f.query(sql)).toMatchObject({isError:true,_meta:{code:'source_unavailable'}});
 });
 it('current binding and entitlement decisions are read again on the next request',async()=>{
  const f=await fixture(),sql='SELECT field_1 FROM warehouse.public.records';expect((await f.query(sql)).isError).not.toBe(true);
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='withheld' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));expect(await f.query(sql)).toMatchObject({isError:true,_meta:{code:'element_withheld'}});
  await f.authorization.write([{operation:'delete',resource:{type:'datasource',id:f.source},relation:'bound_pool',subject:{type:'pool',id:f.pool}}]);
  expect(await f.query('SELECT field_4 FROM warehouse.public.records')).toMatchObject({isError:true,_meta:{code:'sql_not_permitted'}});
 });
 it('a dead sidecar after a successful request never serves the preceding result',async()=>{
  const f=await fixture(),sql='SELECT field_1 FROM warehouse.public.records';expect((await f.query(sql)).isError).not.toBe(true);await f.host.close();
  const response=await f.query(sql);expect(response).toMatchObject({isError:true,_meta:{code:'source_unavailable',cause:'sidecar_transport_failed',retryable:false}});expect(response.structuredContent).toBeUndefined();
 });
 it('disconnecting the MCP request aborts its sidecar request',async()=>{
  const f=await fixture();let started!:()=>void;const beginning=new Promise<void>(resolve=>{started=resolve;});let stopped!:()=>void;const ended=new Promise<void>(resolve=>{stopped=resolve;});
  vi.spyOn(f.execution,'execute').mockImplementation(async(_request,signal)=>{started();await new Promise<void>(resolve=>{if(signal?.aborted)resolve();else signal?.addEventListener('abort',()=>resolve(),{once:true});});stopped();return err(new DomainError('source_unavailable','Cancelled.'));});
  const controller=new AbortController();const pending=fetch(f.url,{method:'POST',signal:controller.signal,headers:{authorization:`Bearer ${f.issued.key}`,'x-opintel-agent-id':'unverified-agent','mcp-session-id':f.transport.sessionId!,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:900,method:'tools/call',params:{name:'opintel.query',arguments:{sql:'SELECT field_1 FROM warehouse.public.records'}}})});
  const settled=pending.catch(error=>error as unknown);await beginning;controller.abort();await settled;await ended;expect([...f.writer.records.values()].at(-1)?.outcome?.kind).not.toBe('answered');
 });
 it('a permissive pre-filter cannot authorize prohibited SQL',async()=>{
  const f=await fixture();vi.spyOn(f.filter,'inspect').mockResolvedValue({ok:true,value:{kind:'requires_sidecar_inspection'}});
  const response=await f.query("ATTACH 'outside.db' AS outside");expect(response).toMatchObject({isError:true,_meta:{code:'sql_not_permitted',proofCategory:'serialization_refused'}});expect(f.boundary.executions).toBe(0);
 });
 it('evidence persistence failure withholds rows',async()=>{
  const f=await fixture();vi.spyOn(f.writer,'close').mockResolvedValue(err(new DomainError('dependency_unavailable','Evidence could not be recorded.')));
  const response=await f.query('SELECT field_1 FROM warehouse.public.records');expect(response).toMatchObject({isError:true,_meta:{code:'dependency_unavailable'}});expect(response.structuredContent).toBeUndefined();
 });
 it('an unavailable writer prevents source execution',async()=>{
  const f=await queryFixture(new UnavailableEvidenceWriter());cleanup.push(f.close);const read=vi.spyOn(f.reader,'read'),execute=vi.spyOn(f.execution,'execute'),health=vi.spyOn(f.execution,'health');
  const response=await f.query('SELECT field_1 FROM warehouse.public.records');expect(response).toMatchObject({isError:true,_meta:{code:'dependency_unavailable'}});expect(response._meta).toMatchObject({cause:'evidence_before_execution'});expect(read).toHaveBeenCalled();expect(health).toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
 });
 it('5.8: complete MCP responses never expose configured aggregate thresholds',async()=>{
  const f=await fixture();
  const limit=999;
  await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{query,aggregateMinGroupSize}',to_jsonb($2::int)) WHERE id=$1",[f.ctx.projectId,limit]));
  for(const sql of ['SELECT field_1 FROM warehouse.public.records','SELECT field_3 FROM warehouse.public.records','SELECT SUM(field_3) FROM warehouse.public.records','SELECT field_4,SUM(field_3) FROM warehouse.public.records GROUP BY field_4','SELECT SUM(total) FROM (SELECT SUM(field_3) AS total FROM warehouse.public.records) q']){
   const response=await f.query(sql);
   expect(JSON.stringify(response)).not.toMatch(/\b999\b|aggregateMinGroupSize|threshold|treatmentEvidence/u);
   if(response.isError)expect(response).not.toHaveProperty('structuredContent');
  }
  vi.spyOn(f.execution,'execute').mockResolvedValue(err(new DomainError('unsupported_on_aggregate_only','Internal threshold 999',{cause:'cardinality_count_invalid',name:'field_3',stage:2,aggregateMinGroupSize:limit,nested:{value:limit}},true)));
  const invalid=await f.query('SELECT SUM(field_3) FROM warehouse.public.records');
  expect(invalid).toMatchObject({_meta:{cause:'cardinality_count_invalid',retryable:false}});expect(JSON.stringify(invalid)).not.toContain(String(limit));
  const listing=await f.client.listTools();
  const describe=await f.client.callTool({name:'opintel.describe',arguments:{}});
  const unavailable=await f.client.callTool({name:'opintel.explain',arguments:{sql:'SELECT 1'}});
  for(const response of [listing,describe,unavailable])expect(JSON.stringify(response)).not.toMatch(/\b999\b|aggregateMinGroupSize/u);
 });
 it('I-009: source ordinals determine withheld order, and masked projections keep their lineage',async()=>{
  const f=await fixture();
  await withTenant(f.ctx,async tx=>{
   await tx.query("UPDATE entitlement SET treatment='withheld' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[1]]);
   await tx.query("UPDATE catalog_element SET ordinal=20 WHERE id=$1",[f.ids[1]]);
   await tx.query("UPDATE entitlement SET treatment='masked',mask_kind='all' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[3]]);
  });
  const result=await f.query('SELECT field_4 AS renamed FROM warehouse.public.records');
  expect(result.content).toEqual([{type:'text',text:'7 rows. 2 elements were withheld: field_5, field_2. field_4 was returned masked.'}]);
  const maximum=await f.query('SELECT MAX(field_4) FROM warehouse.public.records');
  expect(maximum.content).toEqual([{type:'text',text:'1 row. 2 elements were withheld: field_5, field_2. field_4 was returned masked.'}]);
  const count=await f.query('SELECT COUNT(field_4) FROM warehouse.public.records');
  expect(count.content).toEqual([{type:'text',text:'1 row. 2 elements were withheld: field_5, field_2.'}]);
 });
 it('5.8: COUNT(DISTINCT token) is a count, not a returned token',async()=>{
  const f=await fixture();
  expect((await f.query('SELECT COUNT(DISTINCT field_2) FROM warehouse.public.records')).content).toEqual([{type:'text',text:'1 row. 1 element was withheld: field_5.'}]);
 });
 it('5.8: all resolver states survive the actual MCP metadata allowlist',async()=>{
  const f=await fixture(),read=f.reader.read.bind(f.reader);
  for(const reason of ['all_withheld','all_undecided','mixed_withheld_undecided'] as const){
   const spy=vi.spyOn(f.reader,'read').mockImplementation(async principal=>{const result=await read(principal);return result.ok?{ok:true,value:{...result.value,compilation:{views:[],omitted:[{catalog:'warehouse',schema:'public',name:'records',reason}]}}}:result;});
   expect(await f.query('SELECT * FROM warehouse.public.records')).toMatchObject({_meta:{code:'object_unavailable',cause:reason,reason}});spy.mockRestore();
  }
 });
});
it('startup rejects the evidence test stub in every non-test build',()=>{
 const writer=new TestEvidenceWriter();for(const environment of ['production','development','staging',''])expect(()=>assertEvidenceWriter(writer,environment)).toThrow('non-test build');expect(()=>assertEvidenceWriter(writer,'test')).not.toThrow();
});
