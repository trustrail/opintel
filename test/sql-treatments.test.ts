import { describe,expect,it } from 'vitest';
import { DuckDBSessionEngine,type SessionEngine,type InspectionEvent } from '../sidecar/session/index.js';
import { InspectedSessionExecutor } from '../sidecar/sql/index.js';
import { compileViews,DuckDBQueryParser,QueryPreFilter } from '../src/modules/entitlements/index.js';
import { fixture as compileFixture,unwrap } from './fixtures/view-compiler/input.js';
import { sqlPolicy } from './fixtures/sql-policy.js';
const limits={memoryMb:32,threads:1};
const namespace={catalog:'memory',schema:'main',objects:[{catalog:'memory',schema:'main',name:'orders'}]};
function fixture(rows=12,estimate?:number|null){
 const events:InspectionEvent[]=[],estimates:string[]=[],rendered:unknown[]=[];
 const driver=new DuckDBSessionEngine(undefined,e=>events.push(e));
 const engine:SessionEngine={open:async role=>{
  const session=await driver.open(role);
  if(role==='agent')await session.execute(`CREATE TABLE orders AS SELECT i AS id, i*10 AS amount, CASE WHEN i<=5 THEN 'a' WHEN i<=11 THEN 'b' ELSE 'c' END AS city, 'held-token' AS customer_id FROM range(1,${rows+1}) r(i)`);
  const inspection=session.inspection!;
  return {...session,inspection:{...inspection,estimate:async sql=>{estimates.push(sql);return estimate===undefined?inspection.estimate(sql):estimate;},render:async tree=>{rendered.push(tree);return inspection.render(tree);}}};
 }};
 const policy=sqlPolicy([{...namespace.objects[0]!,columns:[{name:'id'},{name:'amount',treatment:'aggregate_only'},{name:'city'},{name:'customer_id',treatment:'tokenized'}]}]);
 const executor=new InspectedSessionExecutor(engine,e=>events.push(e));
 return {events,estimates,rendered,policy,executor,run:(sql:string)=>executor.execute(sql,limits,namespace,policy)};
}
function expectCode(result:Awaited<ReturnType<InspectedSessionExecutor['execute']>>,code:string){
 expect(result.ok,result.ok?'Unexpected rows':result.error.message).toBe(false);
 if(!result.ok)expect(result.error.code).toBe(code);
}
describe('S2d authoritative treatment enforcement',{timeout:30000},()=>{
 for(const [id,sql] of [
  ['VC-10','SELECT amount FROM orders'],['VC-12','SELECT city FROM orders WHERE amount>0'],
  ['VC-13','SELECT SUM(amount) FROM orders ORDER BY amount'],['VC-27','SELECT count(*) FROM orders WHERE amount IS NULL'],
  ['direct argument','SELECT SUM(amount+1) FROM orders'],['group key','SELECT sum(amount) FROM orders GROUP BY amount'],
  ['window','SELECT SUM(amount) OVER () FROM orders'],['alias','WITH q AS (SELECT amount AS a FROM orders) SELECT a FROM q'],
  ['star','SELECT * FROM orders'],['ordinal','SELECT amount FROM orders ORDER BY 1'],
 ] as const)it(`${id} refuses before preparation`,async()=>{
  const f=fixture(),result=await f.run(sql);expectCode(result,'unsupported_on_aggregate_only');
  expect(f.events.some(e=>e.stage==='prepare_started'||e.stage==='execute_started')).toBe(false);
  if(!result.ok){expect(result.error.details).toMatchObject({stage:1,aggregateMinGroupSize:5});expect(result.error.message).toContain('amount');expect(result.error.message).toContain('Use an aggregate');}
 });
 it('5.8: nested refusal retains S2d message and distinguishes the actual outer aggregate',async()=>{
  for(const [sql,cause] of [
   ['SELECT SUM(total) FROM (SELECT SUM(amount) AS total FROM orders) q','nested_aggregation'],
   ['SELECT 1 FROM (SELECT SUM(amount) AS total FROM orders) q','inner_group_counts_unverifiable'],
  ]){
   const f=fixture(),result=await f.run(sql!);
   expectCode(result,'unsupported_on_aggregate_only');
   if(!result.ok){expect(result.error.details).toMatchObject({cause,name:'amount'});expect(result.error.message).toBe('Construct SELECT_NODE contains nested aggregation over an aggregate-only element. The cardinality check cannot preserve and verify the inner groups’ counts through nesting; it has not determined that those groups are below the threshold. Use a single aggregate query so group sizes can be checked.');}
   expect(f.events.some(e=>e.stage==='prepare_started'||e.stage==='execute_started')).toBe(false);
  }
 });
 it('VC-11 permits compliant groups, strips its count, and executes only the reinspected retained handle',async()=>{
  const f=fixture(11),result=await f.run('SELECT city,SUM(amount) AS total FROM orders GROUP BY city ORDER BY city');
  expect(result.ok&&result.value.columns).toEqual(['city','total']);
  expect(result.ok&&result.value.rows).toEqual([['a','150'],['b','510']]);
  expect(result.ok&&result.value.treatmentEvidence).toMatchObject({stage2Ran:true,aggregateMinGroupSize:5});
  expect(f.estimates).toEqual([]);expect(f.rendered).toHaveLength(1);
  expect(f.events.filter(e=>e.stage==='parse_started')).toHaveLength(2);
  expect(f.events.filter(e=>e.stage==='execute_started')).toHaveLength(1);
  expect(f.events.at(-1)?.stage).toBe('released');
 });
 for(const [id,sql] of [
  ['VC-14','SELECT id,SUM(amount) FROM orders GROUP BY id'],
  ['VC-23','SELECT city,SUM(amount) FROM orders WHERE id=1 GROUP BY city'],
  ['VC-26','SELECT city,SUM(amount) FROM orders GROUP BY city'],
 ] as const)it(`${id} refuses the whole result, not just the small groups`,async()=>{
  const f=fixture(),result=await f.run(sql);expectCode(result,'unsupported_on_aggregate_only');expect(result).not.toHaveProperty('value');
  expect(!result.ok&&result.error.details).toMatchObject({stage:2,aggregateMinGroupSize:5});
  expect(f.events).toContainEqual({stage:'cardinality',phase:2,threshold:5,estimate:null,passed:false,counted:true});
 });
 it('stage 1 refuses a supported estimate below the threshold without execution',async()=>{
  const f=fixture(2),result=await f.run('SELECT SUM(amount) FROM orders');expectCode(result,'unsupported_on_aggregate_only');
  expect(!result.ok&&result.error.details?.stage).toBe(1);expect(f.rendered).toEqual([]);
  expect(f.events.some(e=>e.stage==='execute_started'||e.stage==='prepare_started')).toBe(false);
 });
 it('VC-24 an overestimate close to the threshold cannot release a singleton',async()=>{
  const f=fixture(1,6),result=await f.run('SELECT SUM(amount) FROM orders');expectCode(result,'unsupported_on_aggregate_only');
  expect(!result.ok&&result.error.details?.stage).toBe(2);
  expect(f.events).toContainEqual({stage:'cardinality',phase:1,threshold:5,estimate:6,passed:true,counted:false});
 });
 it('VC-25 supported estimate above twice the threshold has no COUNT rewrite or stage 2',async()=>{
  const f=fixture(),result=await f.run('SELECT SUM(amount) FROM orders');expect(result.ok&&result.value.rows).toEqual([['780']]);
  expect(result.ok&&result.value.treatmentEvidence.stage2Ran).toBe(false);expect(f.rendered).toEqual([]);
  expect(f.events.filter(e=>e.stage==='parse_started')).toHaveLength(1);
 });
 it('an estimate exactly twice the threshold still requires stage 2',async()=>{
  const f=fixture(10),result=await f.run('SELECT SUM(amount) FROM orders');expect(result.ok&&result.value.treatmentEvidence.stage2Ran).toBe(true);
 });
 it('uncertain estimates require stage 2, including joins and skewed groups',async()=>{
  const f=fixture(1,null);expectCode(await f.run('SELECT SUM(amount) FROM orders'),'unsupported_on_aggregate_only');
  const joined=fixture();expectCode(await joined.run('SELECT a.city,SUM(a.amount) FROM orders a JOIN orders b ON a.id=b.id GROUP BY a.city'),'unsupported_on_aggregate_only');
  expect(joined.estimates).toEqual([]);expect(joined.rendered).toHaveLength(1);
 });
 it('a compliant uncertain join executes with counts rather than a blanket refusal',async()=>{
  const f=fixture(11),result=await f.run('SELECT a.city,SUM(a.amount) FROM orders a JOIN orders b ON a.id=b.id GROUP BY a.city ORDER BY a.city');
  expect(result.ok&&result.value.rows).toEqual([['a','150'],['b','510']]);
  expect(result.ok&&result.value.treatmentEvidence.stage2Ran).toBe(true);expect(f.estimates).toEqual([]);
 });
 it('VC-28 the next execution uses and records the new project threshold',async()=>{
  const f=fixture(6);expect((await f.run('SELECT SUM(amount) FROM orders')).ok).toBe(true);
  f.policy.aggregateMinGroupSize=7;
  const result=await f.run('SELECT SUM(amount) FROM orders');expectCode(result,'unsupported_on_aggregate_only');
  expect(!result.ok&&result.error.details?.aggregateMinGroupSize).toBe(7);
 });
 const prohibitedTokens=[
  'SELECT customer_id FROM orders ORDER BY customer_id','SELECT customer_id AS token FROM orders ORDER BY token',
  'SELECT customer_id FROM orders ORDER BY 1',
  ...['<','<=','>','>='].map(op=>`SELECT id FROM orders WHERE customer_id ${op} 'held-token'`),
  "SELECT id FROM orders WHERE customer_id BETWEEN 'a' AND 'z'",'SELECT MIN(customer_id) FROM orders','SELECT MAX(customer_id) FROM orders',
  "SELECT id FROM orders WHERE customer_id LIKE 'held%'",...['+','-','*','/','%'].map(op=>`SELECT customer_id ${op} 1 FROM orders`),
  'SELECT COUNT(*) OVER (ORDER BY customer_id RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM orders',
  'WITH q AS (SELECT customer_id AS token FROM orders) SELECT token FROM q ORDER BY token',
 ];
 for(const sql of prohibitedTokens)it(`VC-29 token operation refuses: ${sql}`,async()=>{
  const f=fixture(),result=await f.run(sql);expectCode(result,'unsupported_on_token');
  if(!result.ok){expect(result.error.message).toContain('customer_id');expect(result.error.message).toContain('equality');expect(result.error.details?.operation).toBeTruthy();}
  expect(f.events.some(e=>e.stage==='prepare_started')).toBe(false);
 });
 for(const sql of [
  "SELECT customer_id FROM orders WHERE customer_id='held-token'", "SELECT customer_id FROM orders WHERE customer_id<>'unknown-token'",
  "SELECT customer_id FROM orders WHERE customer_id IN ('held-token')", "SELECT customer_id FROM orders WHERE customer_id NOT IN ('other')",
  'SELECT customer_id FROM orders WHERE customer_id IS NULL','SELECT customer_id,COUNT(*) FROM orders GROUP BY customer_id',
  'SELECT COUNT(customer_id),COUNT(DISTINCT customer_id) FROM orders',
  'SELECT a.customer_id FROM orders a JOIN orders b ON a.customer_id=b.customer_id',
 ])it(`VC-30 token equality operation allowed: ${sql}`,async()=>{
  const f=fixture(),result=await f.run(sql);expect(result.ok,result.ok?'':result.error.message).toBe(true);
 });
 it('the internal count does not shadow an agent output alias',async()=>{
  const f=fixture(11),result=await f.run('SELECT city AS __group_size,SUM(amount) AS total FROM orders GROUP BY city ORDER BY __group_size');
  expect(result.ok&&result.value.columns).toEqual(['__group_size','total']);
  expect(result.ok&&result.value.rows).toEqual([['a','150'],['b','510']]);
 });
 it('validate repeats authoritative inspection and binding, but cannot discharge stage 2',async()=>{
  const f=fixture(),result=await f.executor.validate('SELECT city,SUM(amount) FROM orders GROUP BY city',limits,namespace,f.policy);
  expect(result.ok&&result.value.treatmentEvidence).toMatchObject({stage2Required:true,stage2Ran:false});
  expect(f.events.some(e=>e.stage==='prepared')).toBe(true);expect(f.events.some(e=>e.stage==='execute_started')).toBe(false);
  expectCode(await f.run('SELECT city,SUM(amount) FROM orders GROUP BY city'),'unsupported_on_aggregate_only');
 });
 it('cannot run on missing decisions or a read plan that omits a staged column',async()=>{
  const f=fixture();f.policy.entitlements.pop();expectCode(await f.run('SELECT customer_id FROM orders'),'sql_not_permitted');
  const other=fixture();other.policy.readPlan[0]!.columns.pop();expectCode(await other.run('SELECT id FROM orders'),'sql_not_permitted');
  expectCode(await fixture().executor.execute('SELECT amount FROM orders',limits,namespace),'sql_not_permitted');
 });
 it('a permissive application outcome cannot authorize a protected selection',async()=>{
  const f=fixture(),sql='SELECT amount FROM memory.main.orders';
  const views=unwrap(compileViews(compileFixture([{name:'orders',alias:'memory',schema:'main',columns:[{name:'amount',treatment:'clear',type:'BIGINT'}]}]))).views;
  const application=await new QueryPreFilter(new DuckDBQueryParser()).inspect({sql,views,queryEngineBuild:'v1.4.3/d1dc88f950'});
  expect(application).toEqual({ok:true,value:{kind:'requires_sidecar_inspection'}});
  expectCode(await f.run(sql),'unsupported_on_aggregate_only');
 });
});


describe('5.24a independent authoritative equality join inspection',{timeout:30000},()=>{
 const tables=[{catalog:'memory',schema:'main',name:'lefts'},{catalog:'memory',schema:'main',name:'rights'}];
 const ns={catalog:'memory',schema:'main',objects:tables};
 const policy=sqlPolicy(tables.map((t,i)=>({...t,columns:[{name:'id',treatment:'tokenized' as const,tokenDomain:i?'rightdomain':'leftdomain'},{name:'plain'}]})));
 const run=async(sql:string)=>{
  const events:InspectionEvent[]=[];const driver=new DuckDBSessionEngine();
  const engine:SessionEngine={open:async role=>{const session=await driver.open(role);if(role==='agent')for(const t of tables){await session.execute(`CREATE TABLE ${t.name}(id VARCHAR, plain VARCHAR)`);await session.execute(`INSERT INTO ${t.name} VALUES ('token_${t.name}', 'plain')`);}return session;}};
  const result=await new InspectedSessionExecutor(engine,e=>events.push(e)).execute(sql,limits,ns,policy);return {result,events};
 };
 it.each([
  'SELECT a.id FROM lefts a JOIN rights b ON a.id=b.id',
  'SELECT a.id FROM lefts a, rights b WHERE a.id=b.id',
  'SELECT a.id FROM lefts a JOIN rights b ON a.id=b.plain',
  'SELECT a.id FROM lefts a JOIN rights b ON b.plain=a.id',
  'WITH q AS (SELECT id AS renamed FROM lefts) SELECT q.renamed FROM q JOIN rights b ON q.renamed=b.id',
  'SELECT q.renamed FROM (SELECT id AS renamed FROM lefts) q JOIN rights b ON q.renamed=b.id',
 ])('JOIN-001/JOIN-002: refuses before PREPARE: %s',async sql=>{
  const {result,events}=await run(sql);expectCode(result,'unsupported_on_token');
  if(!result.ok){expect(result.error.details).toMatchObject({cause:'unsatisfiable_token_join',columns:expect.any(Array)});expect(result.error.message).toContain('memory.main.lefts.id');expect(result.error.message).toContain('memory.main.rights.');expect(result.error.message).not.toMatch(/leftdomain|rightdomain/);}
  expect(events.some(e=>e.stage==='prepare_started'||e.stage==='execute_started')).toBe(false);
 });
 it.each(['SELECT a.id FROM lefts a JOIN lefts b ON a.id=b.id','SELECT a.id FROM lefts a JOIN rights b ON a.id<>b.id','SELECT a.id FROM lefts a JOIN rights b ON NOT(a.id=b.id)',"SELECT id FROM lefts WHERE id='held-token'"])
 ('JOIN-003: accepts unchanged semantics: %s',async sql=>{const {result}=await run(sql);expect(result.ok).toBe(true);if(result.ok&&!sql.includes('held-token'))expect(result.value.rows).toHaveLength(1);});
});
