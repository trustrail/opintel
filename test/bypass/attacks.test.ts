import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { readdir,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as publishedSession from '../../sidecar/session/index.js';
import { fixtures,run,refused,noLeak,positive,record,findings,proofs,literal,secret,rawCard } from './harness.js';
let files:Awaited<ReturnType<typeof fixtures>>;
beforeAll(async()=>{files=await fixtures();},30000);
afterAll(async()=>{
 if(process.env.BYPASS_REPORT)await writeFile(process.env.BYPASS_REPORT,JSON.stringify(findings,null,2)+'\n');
 if(process.env.BYPASS_PROOF_REPORT)await writeFile(process.env.BYPASS_PROOF_REPORT,JSON.stringify(proofs,null,2)+'\n');
 await files?.close();
},30000);
const settings:Record<string,string>={temp_directory:"'/tmp'",max_temp_directory_size:"'1GB'",enable_external_access:'true',autoinstall_known_extensions:'true',autoload_known_extensions:'true',allow_unsigned_extensions:'true',memory_limit:"'64GB'",threads:'8',lock_configuration:'false'};
const ref='__staging.warehouse__public__orders';
describe('S2b specification attacks (intentionally red until their owning items land)',{timeout:30000},()=>{
 for(const alias of ['other','pg_warehouse'])it(`J-012 attaching database as ${alias}`,async()=>{
  refused('J-012',alias,await run(`ATTACH ${literal(join(files.dir,'other.db'))} AS ${alias} (READ_ONLY)`,{fileDatabase:join(files.dir,'other.db')}),'sql_not_permitted','ATTACH');
 });
 it('J-012 extension-backed Postgres attachment',async()=>{
  // Loopback only: a regression must never contact a customer or public host.
  refused('J-012','postgres scanner',await run("ATTACH 'host=127.0.0.1 port=1 dbname=bypass connect_timeout=1' AS remote (TYPE postgres)"),'sql_not_permitted');
 });
 for(const [fn,file] of [['read_csv','data.csv'],['read_parquet','data.parquet'],['read_json','data.json'],['read_text','data.txt'],['read_blob','data.txt'],['glob','data.*']] as const){
  it(`J-016 ${fn} reads an existing controlled sentinel file`,async()=>refused('J-016',fn,await run(`SELECT * FROM ${fn}(${literal(join(files.dir,file))})`),'sql_not_permitted',fn));
 }
 it('J-016 literal /etc/passwd route',async()=>refused('J-016','passwd',await run("SELECT * FROM read_csv('/etc/passwd')"),'sql_not_permitted','read_csv'));
 it('J-027 bare-filename shorthand',async()=>refused('J-027','bare filename',await run(`SELECT * FROM ${literal(join(files.dir,'data.csv'))}`),'sql_not_permitted'));
 it('J-015 COPY TO must neither complete nor create a file',async()=>{
  const result=await run(`COPY (SELECT 1) TO ${literal(join(files.dir,'out.csv'))}`);
  expect(await readdir(files.dir)).not.toContain('out.csv');refused('J-015','COPY TO',result,'sql_not_permitted');
 });
 for(const sql of ['INSTALL httpfs','LOAD httpfs','INSTALL httpfs; LOAD httpfs',"SELECT load_extension('httpfs')"]){
  it(`J-017 ${sql}`,async()=>refused('J-017',sql,await run(sql),'sql_not_permitted'));
 }
 it('J-028 enumerate loaded extensions and exercise their registered external-access functions',async()=>{
  const extensions=await run('SELECT * FROM duckdb_extensions()');
  if(!extensions.ok)refused('J-028','extension inventory',extensions);
  const rows=await run("SELECT function_name FROM duckdb_functions() WHERE function_name IN ('read_csv','read_parquet','read_json','read_text','read_blob','glob','sqlite_scan','postgres_scan','http_get')");
  expect(rows.ok).toBe(true);if(!rows.ok)return;
  const names=new Set(rows.value.rows.map(r=>String(r[0])));
  expect(names.size,'External-route inventory must not be empty').toBeGreaterThan(0);
  const invocations:Record<string,string>={read_csv:`read_csv(${literal(join(files.dir,'data.csv'))})`,read_parquet:`read_parquet(${literal(join(files.dir,'data.parquet'))})`,read_json:`read_json(${literal(join(files.dir,'data.json'))})`,read_text:`read_text(${literal(join(files.dir,'data.txt'))})`,read_blob:`read_blob(${literal(join(files.dir,'data.txt'))})`,glob:`glob(${literal(join(files.dir,'*'))})`,sqlite_scan:`sqlite_scan(${literal(join(files.dir,'other.db'))},'orders')`,postgres_scan:"postgres_scan('host=127.0.0.1 port=1 connect_timeout=1','public','orders')",http_get:"http_get('http://127.0.0.1:1/')"};
  for(const name of names){const result=await run(`SELECT * FROM ${invocations[name]}`);refused('J-028',name,result);}
  if(extensions.ok)record('J-028','inventory','CONTROL',JSON.stringify(extensions.value));
 });
 for(const [id,key] of [['J-014','enable_external_access'],['J-029','lock_configuration'],['J-030','temp_directory'],['J-032','memory_limit']] as const){
  it(`${id} SET ${key}`,async()=>refused(id,key,await run(`SET ${key} = ${settings[key]}`)));
 }
 for(const [name,value] of Object.entries(settings)){
  it(`J-031 PRAGMA ${name}`,async()=>refused('J-031',name,await run(`PRAGMA ${name}=${value}`)));
  it(`J-051 RESET ${name}`,async()=>refused('J-051',name,await run(`RESET ${name}`)));
 }
 it('J-031 bare PRAGMA enable_external_access',async()=>refused('J-031','bare spelling',await run('PRAGMA enable_external_access')));
 it('J-020 memory exhaustion with spill disabled',async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),resolve('test/bypass/memory-probe.ts')],{cwd:files.dir,timeout:25000});
  const result=JSON.parse(stdout) as {message:string;before:string[];after:string[];settings:unknown[][];events:{stage:string}[]};
  expect(result.events.map(e=>e.stage)).toEqual(['parse_started','parse_succeeded','serialize_started','serialized','inspected','prepare_started','prepared','inspected','execute_started','released']);
  record('J-020','memory pressure',result.message?'REFUSED_RAW':'ATTACK_SUCCEEDED',result.message||'Allocation completed');
  expect(result.message).toMatch(/Out of Memory Error/iu);expect(result.after).toEqual(result.before);
  expect(result.settings).toEqual([['','0 bytes']]);
 });
 const baseCases=[
  ['J-004','staging',`SELECT * FROM ${ref}`],['J-004','internal alias','SELECT * FROM pg_warehouse.public.orders'],
  ['J-005','withheld via base','SELECT salary FROM pg_warehouse.public.orders'],
  ['J-011','quoted case','SELECT * FROM "PG_Warehouse"."PUBLIC"."ORDERS"'],
  ['J-009','CTE',`WITH x AS (SELECT * FROM ${ref}) SELECT * FROM x`],
  ['J-009','subquery',`SELECT * FROM (SELECT * FROM ${ref}) x`],
  ['J-009','UNION',`SELECT id FROM warehouse.public.orders UNION ALL SELECT id FROM ${ref}`],
  ['J-009','join',`SELECT b.salary FROM warehouse.public.orders a JOIN ${ref} b ON true`],
  ['J-018','view body',`CREATE VIEW v AS SELECT * FROM ${ref}; SELECT * FROM v`],
  ['J-010','macro body',`CREATE MACRO m() AS (SELECT salary FROM ${ref}); SELECT m()`],
  ['J-010','prepared reference',`PREPARE p AS SELECT * FROM ${ref}; EXECUTE p`],
  ['J-056','dynamic query_table',`SELECT * FROM query_table('${ref}')`],
  ['J-057','dynamic query',`SELECT * FROM query('SELECT * FROM ${ref}')`],
 ] as const;
 for(const [id,label,sql] of baseCases){
  it(`${id} ${label}; J-046 same SQL succeeds when authorized`,async()=>{
   const control=await positive(sql);expect(control.rows.flat().some(v=>v===secret||v===1)).toBe(true);
   record('J-046',label,'CONTROL','Same statement resolved and returned fixture data in positive configuration');
   const result=await run(sql);refused(id,label,result);
   if(!result.ok)expect(result.message).toMatch(/not found|does not exist|not permitted|unavailable/iu);
  });
 }
 for(const alias of ['_warehouse','internal_warehouse','base_warehouse','source_warehouse']){
  it(`J-004 plausible alias ${alias} with matching positive fixture`,async()=>{
   // First create the alias in the trusted positive configuration, not in the attack.
   const sql=`SELECT * FROM ${alias}.public.orders`;
   const positiveSql=`ATTACH ':memory:' AS ${alias}; CREATE SCHEMA ${alias}.public; CREATE TABLE ${alias}.public.orders AS SELECT 1 AS id`;
   // Extra setup is a published dependency-injection fixture, never agent SQL.
   const result=await run(sql,{positiveSetup:positiveSql});
   expect(result.ok).toBe(true);record('J-046',alias,'CONTROL','Positive alias fixture resolved');
   refused('J-004',alias,await run(sql));
  });
 }
 for(const sql of ['SELECT * FROM duckdb_tables()','SELECT * FROM duckdb_columns()','SELECT * FROM duckdb_databases()','SELECT database_name FROM duckdb_databases()','SELECT * FROM duckdb_views()','SELECT * FROM information_schema.tables','SELECT * FROM information_schema.columns']){
  const id=sql.includes('information_schema')?'J-007':sql.includes('views()')?'J-008':'J-006';
  it(`${id} ${sql}`,async()=>{const control=await positive(sql);expect(JSON.stringify(control)).toMatch(/__staging|pg_warehouse|salary/u);noLeak(id,sql,await run(sql));});
 }
 it('J-013 search_path into base catalogue',async()=>{
  await positive('SET search_path = \'pg_warehouse.public\'; SELECT * FROM orders');
  refused('J-013','search_path',await run("SET search_path = 'pg_warehouse.public'; SELECT * FROM orders"));
 });
 for(const [id,column] of [['J-033','salary'],['J-034','undecided_col']] as const){
  it(`${id} direct hidden column with valid allowed table`,async()=>{
   await positive(`SELECT ${column} FROM records`);
   const result=await run(`SELECT ${column} FROM records`);refused(id,column,result);
   if(!result.ok){expect(result.message).toMatch(/column|not found/iu);expect(result.message).not.toMatch(/withheld|undecided entitlement|entitlement_missing/iu);expect(result.message).not.toContain(secret);}
  });
 }
 for(const [id,label,sql,code] of [
  ['J-035','post-filter singleton',"SELECT SUM(amount) FROM t WHERE transaction_id = 'x'",'unsupported_on_aggregate_only'],
  ['J-036','unaggregated amount','SELECT amount FROM t','unsupported_on_aggregate_only'],
  ['J-037','MIN token','SELECT MIN(customer_id) FROM t','unsupported_on_token'],
  ['J-038','ORDER token','SELECT * FROM t ORDER BY customer_id','unsupported_on_token'],
  ['J-038','ORDER unselected token','SELECT amount FROM t ORDER BY customer_id','unsupported_on_token'],
  ['J-039','LIKE token',"SELECT * FROM t WHERE customer_id LIKE 'v1_c_A%'",'unsupported_on_token'],
 ] as const){it(`${id} ${label}`,async()=>{const control=await run('SELECT count(*) FROM t');expect(control.ok&&control.value.rows[0]).toEqual(['6']);refused(id,label,await run(sql),code);});}
 it('J-040 grouping cannot reconstruct an already-masked staged column',async()=>{
  const result=await run('SELECT card_number,COUNT(*) FROM t GROUP BY 1');expect(result.ok).toBe(true);
  expect(result.ok&&result.value.rows).toEqual([['************1234','6']]);expect(JSON.stringify(result)).not.toContain(rawCard);
  record('J-040','group mask','NO_LEAK','Only the pretreated fixture mask is returned; source-to-staging transformation remains S2e');
 });
 for(const [label,sql] of [['permitted view','CREATE VIEW public.allowed_copy AS SELECT * FROM records; SELECT * FROM public.allowed_copy'],['permitted macro','CREATE MACRO public.peek() AS (SELECT amount FROM t LIMIT 1); SELECT public.peek()']] as const){
  it(`J-018 ${label} must still refuse CREATE`,async()=>refused('J-018',label,await run(sql),'sql_not_permitted'));
 }
 it('J-041 multiple statements',async()=>refused('J-041','stacked SET',await run('SELECT 1; SET enable_external_access = true')));
 it('J-042 comments and whitespace',async()=>refused('J-042','commented ATTACH',await run(`SELECT/*x*/1;\n/*concealed*/ ATTACH ${literal(join(files.dir,'other.db'))} AS stolen`),'sql_not_permitted'));
 for(const keyword of ['aTtAcH','ＡＴＴＡＣＨ'])it(`J-043 ${keyword}`,async()=>refused('J-043',keyword,await run(`${keyword} ${literal(join(files.dir,'other.db'))} AS stolen`),'sql_not_permitted'));
 for(const id of ['J-044','J-045'])it(`${id} BLOCKED: waits for item 5.7 authenticated SQL path to the real session`,()=>{
  // No fake key verifier or test-only authenticated query route: those would
  // prove the harness. The published session interface has no key/pool input.
  expect(Object.keys(publishedSession).sort(),'The published seam changed: replace this prerequisite with the actual authenticated query attack').toEqual(['DuckDBSessionEngine','TwoSessionExecutor']);
  expect(new publishedSession.TwoSessionExecutor().execute.length,'The SQL/limits-only interface changed; wire the real authenticated query path').toBe(2);
  record(id,'prerequisite','BLOCKED','Item 5.7 authenticated query transport with real pool/key/session binding is absent; replace this prerequisite with the actual attack when it lands');
  expect.fail(`${id}: missing item 5.7 authenticated query transport; cannot exercise cross-pool / mid-session revoked or expired keys against SQL execution`);
 });
 it('J-047 broken-hardening mutation control',async()=>{
  const sql="SET memory_limit = '64GB'; SELECT current_setting('memory_limit')";
  const locked=await run(sql,{raw:true});expect(locked.ok).toBe(false);
  const broken=await run(sql,{brokenLock:true});expect(broken.ok).toBe(true);
  expect(broken.ok&&broken.value.rows[0]).toEqual(['59.6 GiB']);
  record('J-047','omitted lock','CONTROL','Memory budget alteration succeeds only with the lock deliberately omitted');
 });
 it('J-048 refusals must carry structured error codes',async()=>{
  const result=await run('SET enable_external_access = true');expect(result.ok).toBe(false);
  record('J-048','envelope',!result.ok&&result.code?'REFUSED_STRUCTURED':'MISSING_ENVELOPE',result.ok?'Statement succeeded':result.message);
  expect(!result.ok&&result.code,'No raw engine exceptions at the eventual agent boundary').toBe('sql_not_permitted');
 });
 it('J-010 literal deferred ATTACH must not pass on a syntax error',async()=>refused('J-010','quoted PREPARE ATTACH',await run(`PREPARE p AS ${literal(`ATTACH ${literal(join(files.dir,'other.db'))} AS stolen`)}; EXECUTE p`),'sql_not_permitted'));
 it('J-049 COPY FROM existing sentinel file',async()=>refused('J-049','COPY FROM',await run(`COPY public.copy_target FROM ${literal(join(files.dir,'data.csv'))} (HEADER true)`),'sql_not_permitted'));
 it('J-049 literal COPY FROM passwd',async()=>refused('J-049','COPY FROM passwd',await run("COPY public.copy_target FROM '/etc/passwd'"),'sql_not_permitted'));
 for(const sql of ['CALL duckdb_settings()','CALL duckdb_tables()','CALL pragma_version()'])it(`J-050 ${sql}`,async()=>refused('J-050',sql,await run(sql),'sql_not_permitted'));
 for(const sql of ['PIVOT records ON transaction_id USING sum(amount)','UNPIVOT records ON id,amount INTO NAME column_name VALUE value']){
  it(`J-052 ${sql}`,async()=>{
   const result=await run(sql);refused('J-052',sql,result,'sql_not_permitted');
   expect(!result.ok&&result.category).toBe(sql.startsWith('PIVOT ')?'serialization_refused':'sql_not_permitted');
  });
 }
 it('J-053 spelling suggestions do not reveal salary',async()=>{
  const control=await run('SELECT salry FROM t',{positive:true});expect(!control.ok&&control.message).toContain('salary');
  const result=await run('SELECT salry FROM t');expect(result.ok).toBe(false);noLeak('J-053','salry',result);
 });
 it('J-054 runtime-error oracle must bind-fail on withheld column',async()=>{
  const sql="SELECT 1/0 FROM t WHERE withheld_col = 'x'";
  const control=await run(sql,{positiveSetup:"ALTER TABLE public.orders ADD COLUMN withheld_col VARCHAR DEFAULT 'x'; CREATE OR REPLACE VIEW public.t AS SELECT * FROM public.orders"});expect(control.ok).toBe(true);
  const result=await run(sql);refused('J-054','runtime oracle',result);if(!result.ok)expect(result.message).toMatch(/column.*not found/iu);
 });
 it('J-055 expected tracker success: both queries meet k=5 yet their difference isolates one salary',async()=>{
  const sql="SELECT SUM(salary),COUNT(*) FROM t WHERE (age = 42 AND zip = '12345') OR random_col > 0.999";
  const padded=await run(sql,{tracker:true}),noise=await run('SELECT SUM(salary),COUNT(*) FROM t WHERE random_col > 0.999',{tracker:true});
  expect(padded.ok&&noise.ok).toBe(true);if(!padded.ok||!noise.ok)return;
  expect(Number(padded.value.rows[0]?.[1])).toBeGreaterThanOrEqual(5);expect(Number(noise.value.rows[0]?.[1])).toBeGreaterThanOrEqual(5);
  expect(Number(padded.value.rows[0]?.[0])-Number(noise.value.rows[0]?.[0])).toBe(101);
  record('J-055','tracker subtraction','EXPECTED_SUCCESS','Both sets meet k=5; subtraction recovers individual salary 101');
 });
 it('J-048 every observed refusal has a structured code; invalid probes are not protection',()=>{
  const raw=findings.filter(f=>f.status==='REFUSED_RAW'||f.status==='INVALID_PROBE').map(f=>`${f.id} ${f.variant}: ${f.status}`);
  expect(raw,'Unstructured or unrelated refusals must not make the suite look complete').toEqual([]);
 });

});
