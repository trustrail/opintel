import { describe,expect,it } from 'vitest';
import { DuckDBSessionEngine, type SessionEngine, type InspectionEvent } from '../sidecar/session/index.js';
import { InspectedSessionExecutor,inspectSubset,queryEngineBuild } from '../sidecar/sql/index.js';
import { sqlPolicy } from './fixtures/sql-policy.js';
const policy=sqlPolicy([{catalog:'memory',schema:'main',name:'orders',columns:[{name:'id'},{name:'amount'}]}]);
const limits={memoryMb:32,threads:1};
const namespace={catalog:'memory',schema:'main',objects:[{catalog:'memory',schema:'main',name:'orders'}]};
function fixture(extra=''){
 const events:InspectionEvent[]=[],closed:string[]=[],raw:string[]=[];
 const driver=new DuckDBSessionEngine(e=>{if(e.role==='agent')raw.push(e.sql);},e=>events.push(e));
 const engine:SessionEngine={open:async role=>{
  const session=await driver.open(role);
  try{if(role==='agent')await session.execute(`CREATE TABLE orders(id INTEGER,amount INTEGER); INSERT INTO orders VALUES (1,10),(2,20); ${extra}`);}
  catch(error){session.close();throw error;}
  return {...session,close:()=>{closed.push(role);session.close();}};
 }};
 return {events,closed,raw,executor:new InspectedSessionExecutor(engine,e=>events.push(e))};
}
describe('S2c authoritative subset and preparation order',{timeout:30000},()=>{
 const prohibited=[
  "ATTACH 'missing.db' AS other",'DETACH other',"COPY orders TO '/tmp/opintel-must-not-write.csv'", "COPY orders FROM '/etc/passwd'",
  'INSTALL httpfs','LOAD httpfs','PRAGMA threads=2','PRAGMA enable_external_access','SET threads=2','RESET threads',
  'CALL duckdb_settings()',"EXPORT DATABASE '/tmp/opintel-must-not-export'",'CREATE VIEW v AS SELECT * FROM orders',
  'CREATE MACRO m() AS (SELECT amount FROM orders LIMIT 1)','PREPARE p AS SELECT * FROM orders; EXECUTE p',
  'INSERT INTO orders VALUES(3,30)','UPDATE orders SET amount=0','DELETE FROM orders','DROP TABLE orders',
  'UNPIVOT orders ON id,amount INTO NAME column_name VALUE value',
  "SELECT * FROM read_csv('/etc/passwd')","SELECT * FROM query('SELECT * FROM orders')","SELECT load_extension('httpfs')",
  "WITH q AS (SELECT * FROM read_parquet('/tmp/missing')) SELECT * FROM q",'SELECT 1; SELECT 2',
  "SELECT 1; /* hide */ aTtAcH 'missing.db' AS x","ＡＴＴＡＣＨ 'missing.db' AS x","PREPARE p AS 'ATTACH ''missing.db'' AS x'; EXECUTE p",
 ];
 for(const sql of prohibited)it(`no prohibited statement reaches prepare or execute: ${sql}`,async()=>{
  const f=fixture(),result=await f.executor.execute(sql,limits,namespace,policy);
  expect(result.ok).toBe(false);
  if(!result.ok)expect(result.error.code).toBe('sql_not_permitted');
  expect(f.events[0]?.stage).toBe('parse_started');
  expect(f.events.some(e=>e.stage==='prepare_started'||e.stage==='execute_started')).toBe(false);
  expect(f.raw).not.toContain(sql);
  expect(f.closed).toEqual(['agent','privileged']);
 });
 for(const sql of ['SELECT amount FROM memory.main.orders ORDER BY id','WITH q AS (SELECT * FROM orders) SELECT amount FROM q',
  'VALUES (10),(20)','DESCRIBE memory.main.orders','SELECT amount FROM orders UNION ALL SELECT 30',
  'SELECT * FROM (SELECT amount FROM orders) q','SELECT amount FROM orders WHERE id IN (SELECT id FROM orders)',
  'SELECT CASE WHEN id=1 THEN amount ELSE 0 END FROM orders'])it(`permits, binds and executes retained handle: ${sql}`,async()=>{
  const f=fixture(),result=await f.executor.execute(sql,limits,namespace,policy);
  expect(result.ok,result.ok?'':result.error.message).toBe(true);
  if(result.ok){expect(result.value.rows.length).toBeGreaterThan(0);expect(result.value.queryEngineVersion).toBe(queryEngineBuild);}
  expect(f.events.map(e=>e.stage)).toEqual(['parse_started','parse_succeeded','serialize_started','serialized','inspected','prepare_started','prepared','inspected','execute_started','executed','released']);
  expect(f.raw).not.toContain(sql);expect(f.closed).toEqual(['agent','privileged']);
 });
 it('two malformed spellings have engine error evidence and no invented tree',async()=>{
  for(const sql of ["ＡＴＴＡＣＨ 'x' AS y","PREPARE p AS 'ATTACH x'; EXECUTE p"]){
   const f=fixture(),result=await f.executor.execute(sql,limits,namespace,policy);
   expect(result.ok).toBe(false);if(!result.ok)expect(result.error.details?.proofCategory).toBe('parse_failed');
   expect(f.events.map(e=>e.stage)).toEqual(['parse_started','parse_failed']);
   expect(f.events.at(-1)).toMatchObject({error:expect.any(String)});
  }
 });
 it('unserializable statements have parse and serializer evidence, no prepare',async()=>{
  const f=fixture(),result=await f.executor.execute('CREATE TABLE never_created(i INTEGER)',limits,namespace);
  expect(!result.ok&&result.error.details?.proofCategory).toBe('serialization_refused');
  expect(f.events.map(e=>e.stage)).toEqual(['parse_started','parse_succeeded','serialize_started','serialization_refused']);
 });
 it('serializing a future ATTACH node cannot widen permission',()=>{
  const result=inspectSubset({error:false,statements:[{node:{type:'ATTACH_NODE'},named_param_map:[]}]},namespace);
  expect(!result.ok&&result.error.details?.construct).toBe('ATTACH_NODE');
 });
 it('an unknown expression-bearing field is refused, never partially inspected',async()=>{
  const session=await new DuckDBSessionEngine().open('agent');
  try{
   const parsed=await session.inspection!.parse('SELECT 1');expect(parsed.kind).toBe('parsed');
   if(parsed.kind!=='parsed')return;
   const tree=structuredClone(parsed.tree) as {statements:{node:Record<string,unknown>}[]};
   tree.statements[0]!.node.hidden_expression={function_name:'read_csv'};
   expect(inspectSubset(tree,namespace).ok).toBe(false);
  }finally{session.close();}
 });
 for(const sql of ['SELECT missing FROM orders','SELECT id FROM orders a JOIN orders b ON a.id=b.id'])it(`binding fails closed: ${sql}`,async()=>{
  const f=fixture(),result=await f.executor.execute(sql,limits,namespace,policy);
  expect(!result.ok&&result.error.details?.stage).toBe('binding');
  expect(f.events.some(e=>e.stage==='inspected'&&e.permitted)).toBe(true);
  expect(f.events.some(e=>e.stage==='binding_failed')).toBe(true);
  expect(f.events.some(e=>e.stage==='execute_started')).toBe(false);
  expect(f.closed).toEqual(['agent','privileged']);
 });
 it('containment refuses unrelated user objects before binding',async()=>{
  const f=fixture('CREATE TABLE private_data(secret VARCHAR)'),result=await f.executor.execute('SELECT * FROM orders',limits,namespace,policy);
  expect(!result.ok&&result.error.message).toContain('outside the pool namespace');
  expect(f.events.some(e=>e.stage==='prepare_started')).toBe(false);
 });
 it('an empty foreign catalogue cannot leak through metadata functions',async()=>{
  const f=fixture("ATTACH ':memory:' AS hidden_alias"),result=await f.executor.execute('SELECT * FROM duckdb_databases()',limits,namespace);
  expect(!result.ok&&result.error.message).toContain('outside the pool namespace');
  expect(f.events.some(e=>e.stage==='prepare_started')).toBe(false);
 });
 it('a user macro cannot shadow a permitted builtin',async()=>{
  const f=fixture('CREATE MACRO abs(x) AS x'),result=await f.executor.execute('SELECT abs(amount) FROM orders',limits,namespace);
  expect(!result.ok&&result.error.message).toContain('outside the pool namespace');
  expect(f.events.some(e=>e.stage==='prepare_started')).toBe(false);
 });
 it('Unicode identifier case does not authorize a different table',async()=>{
  const f=fixture('CREATE TABLE "ä"(secret INTEGER)');
  const input={...namespace,objects:[...namespace.objects,{catalog:'memory',schema:'main',name:'Ä'}]};
  const result=await f.executor.execute('SELECT * FROM "ä"',limits,input);
  expect(!result.ok&&result.error.details?.construct).toBe('ä');
  expect(f.events.some(e=>e.stage==='prepare_started')).toBe(false);
  // Even a permitted query must refuse the contaminated session inventory.
  const contained=await f.executor.execute('SELECT * FROM orders',limits,input);
  expect(!contained.ok&&contained.error.message).toContain('outside the pool namespace');
 });
 it('the retained prepared capability is called once, without SQL text',async()=>{
  const driver=new DuckDBSessionEngine(),calls:string[]=[];
  const engine:SessionEngine={open:async role=>{
   const session=await driver.open(role),inspection=session.inspection!;
   return {...session,inspection:{...inspection,parse:async sql=>{
    calls.push('parse');const parsed=await inspection.parse(sql);
    if(parsed.kind!=='parsed')return parsed;
    return {...parsed,prepare:async()=>{
     calls.push('prepare');const prepared=await parsed.prepare();
     if(prepared.kind!=='bound')return prepared;
     return {kind:'bound',handle:{execute:async()=>{calls.push('retained handle');return prepared.handle.execute();},close:()=>{calls.push('release');prepared.handle.close();}}};
    }};
   }}};
  }};
  const result=await new InspectedSessionExecutor(engine).execute('SELECT 7',limits,{...namespace,objects:[]},sqlPolicy([]));
  expect(result.ok&&result.value.rows).toEqual([[7]]);
  expect(calls).toEqual(['parse','prepare','retained handle','release']);
 });
 it('a parser/engine build mismatch refuses and releases both sessions',async()=>{
  const driver=new DuckDBSessionEngine(),closed:string[]=[];
  const engine:SessionEngine={open:async role=>{
   const s=await driver.open(role);return {...s,inspection:{...s.inspection!,build:async()=> 'different/build'},close:()=>{closed.push(role);s.close();}};
  }};
  const result=await new InspectedSessionExecutor(engine).execute('SELECT 1',limits,namespace,policy);
  expect(!result.ok&&result.error.message).toContain('build');expect(closed).toEqual(['agent','privileged']);
 });
});
