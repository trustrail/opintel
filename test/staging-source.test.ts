import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import { PostgresSourceScope } from '../sidecar/infrastructure/postgres-source-scope.js';
import { PostgresStagingSource } from '../sidecar/execution/infrastructure/postgres-source.js';
import { StagedExecutor } from '../sidecar/execution/application/execute.js';
import { DuckDBSessionEngine } from '../sidecar/session/index.js';
import { SidecarTokenizer,IanaZoneResolver } from '../sidecar/tokenize/index.js';
import { executionRequest } from '../src/shared/execution-contract.js';
const schema='staging_'+randomUUID().replaceAll('-',''),sourceId=randomUUID();
async function fixture(sql:string){const c=new Client({connectionString:process.env.TEST_DATABASE_URL});try{await c.connect();await c.query(sql);}finally{await c.end();}}
beforeAll(async()=>{await fixture(`CREATE SCHEMA ${schema};CREATE TABLE ${schema}.orders(id integer,customer integer,hidden text);INSERT INTO ${schema}.orders VALUES(1,123,'secret'),(2,456,'secret'),(3,789,'secret');ALTER TABLE ${schema}.orders ADD COLUMN numbers bigint[] DEFAULT ARRAY[9007199254740993::bigint,2];ANALYZE ${schema}.orders;`);},30000);
afterAll(async()=>{await fixture(`DROP SCHEMA ${schema} CASCADE`);},30000);
function request(){const elementId=randomUUID();return executionRequest.parse({tokenKeyVersionSelected:1,requestId:'staging-source',entitlements:[{elementId,treatment:'clear'}],projectId:randomUUID(),poolId:randomUUID(),policyVersion:1,sql:'SELECT id FROM orders ORDER BY id',namespace:{catalog:'warehouse',schema:'public'},sources:[{sourceId,credentialRef:'secret://test/source'}],objects:[{catalog:'warehouse',schema:'public',name:'orders',sourceId,readPlan:{catalog:'warehouse',schema,object:'orders',columns:[{sourceIdentifier:'id',exposedName:'id',exposedType:'INTEGER',elementId,treatment:'clear',readAs:'native'}]}}],aggregateMinGroupSize:5,limits:{memoryMb:64,threads:1,timeoutMs:10000,rowLimit:2,concurrency:1},entitlementContext:null});}
function executor(proof?:{attachments:number;appended:unknown[][];closed:string[]}){const scope=new PostgresSourceScope({resolve:async()=>process.env.TEST_DATABASE_URL!},{maxConnectionsPerSource:1,statementTimeoutMs:5000,operationTimeoutMs:10000});const source=new PostgresStagingSource(scope,new SidecarTokenizer({resolveBytes:async()=>Buffer.alloc(32,1)},new IanaZoneResolver()));return new StagedExecutor(source,r=>{const native=new DuckDBSessionEngine(undefined,undefined,resolve('tmp/duckdb-extensions/postgres_scanner.duckdb_extension'),r.limits);return {open:async role=>{const session=await native.open(role);if(proof){const materialize=session.staging!.materialize,append=session.staging!.append,close=session.close;session.staging!.materialize=async(...args)=>{proof.attachments++;return materialize(...args);};session.staging!.append=async(...args)=>{proof.appended.push(...structuredClone(args[3]));return append(...args);};session.close=()=>{proof.closed.push(role);close();};}return session;}};});}
it('C.1 native PostgreSQL attach materializes only the pool columns after pushdown',async()=>{const r=request();r.sql='SELECT id FROM orders WHERE id>1 ORDER BY id';expect(await executor().execute(r)).toMatchObject({ok:true,value:{rows:[[2],[3]],truncated:false,executionPath:'staged'}});},30000);
it('C.1 connector tokenizes an integer before it reaches staging',async()=>{const r=request();r.objects[0]!.readPlan.columns.push({sourceIdentifier:'customer',exposedName:'customer',exposedType:'VARCHAR',elementId:randomUUID(),treatment:'tokenized',readAs:'text',token:{domain:'customer',canonId:'stdnum1',mode:'number',caseInsensitive:false}});r.entitlements.push({elementId:r.objects[0]!.readPlan.columns.at(-1)!.elementId,treatment:'tokenized'});r.sql='SELECT id,customer FROM orders ORDER BY id';const proof={attachments:0,appended:[] as unknown[][],closed:[] as string[]};const result=await executor(proof).execute(r);expect(result.ok,result.ok?'':result.error.message).toBe(true);expect(proof.attachments).toBe(0);expect(proof.appended[0]?.[1]).toMatch(/^v1_customer_/);expect(proof.closed).toEqual(['agent','privileged','agent','privileged']);expect(result).toMatchObject({value:{truncated:true}});if(result.ok){const value=result.value as {rows:unknown[][]};expect(value.rows[0]?.[1]).toMatch(/^v1_customer_/);expect(JSON.stringify(value)).not.toContain('secret');}},30000);

for(const treated of [false,true])it(`C.1 preserves exact clear arrays on the ${treated?'connector':'native'} path`,async()=>{
 const r=request(),elementId=randomUUID();r.objects[0]!.readPlan.columns.push({sourceIdentifier:'numbers',exposedName:'numbers',exposedType:'LIST(BIGINT)',elementId,treatment:'clear',readAs:'native'});r.entitlements.push({elementId,treatment:'clear'});
 if(treated){const c=r.objects[0]!.readPlan.columns[0]!;c.treatment='masked';c.mask={kind:'all'};c.readAs='text';c.exposedType='VARCHAR';r.entitlements[0]!.treatment='masked';}
 r.sql='SELECT numbers FROM orders';const result=await executor().execute(r);expect(result.ok,result.ok?'':result.error.message).toBe(true);expect(result).toMatchObject({value:{rows:[[['9007199254740993','2']],[['9007199254740993','2']]]}});
},30000);
it('J-024 execution telemetry contains only the allowlist, never source values or SQL',async()=>{
 const logs=vi.spyOn(console,'info').mockImplementation(()=>{});try{const r=request();r.sql="SELECT 'ROW_VALUE_SENTINEL' FROM orders";expect((await executor().execute(r)).ok).toBe(true);
 for(const [event] of logs.mock.calls){expect(Object.keys(event as object).every(k=>['event','requestId','projectId','poolId','operation','reason'].includes(k))).toBe(true);}
 expect(JSON.stringify(logs.mock.calls)).not.toContain('ROW_VALUE_SENTINEL');expect(logs).toHaveBeenCalled();}finally{logs.mockRestore();}
},30000);

function numericRequest(type:'numeric'|'money'|'numeric[]'='numeric'){
 const r=request(),c=r.objects[0]!.readPlan.columns[0]!;
 r.objects[0]!.readPlan.object='numeric_values';
 c.sourceIdentifier='amount';c.exposedName='amount';c.exposedType=type==='numeric[]'?'LIST(DECIMAL(38,9))':'DECIMAL(38,9)';
 c.numericDefault=type==='numeric[]'?'array':'scalar';
 r.sql='SELECT SUM(amount) FROM orders';return r;
}
it('bare numeric SUM and AVG remain exact; money is read through numeric',async()=>{
 for(const type of ['numeric','money'] as const){
  await fixture(`CREATE TABLE ${schema}.numeric_values(amount ${type});INSERT INTO ${schema}.numeric_values VALUES(1.25),(2.75);ANALYZE ${schema}.numeric_values;`);
  try{
   const r=numericRequest(type),proof={attachments:0,appended:[] as unknown[][],closed:[] as string[]};
   r.sql='SELECT SUM(amount), AVG(amount) FROM orders';
   const result=await executor(proof).execute(r);expect(result.ok,result.ok?'':result.error.message).toBe(true);
   expect(result).toMatchObject({value:{rows:[['4.000000000',2]]}});expect(proof.attachments).toBe(0);
  }finally{await fixture(`DROP TABLE ${schema}.numeric_values`);}
 }
},30000);
it.each(['clear','aggregate_only','masked','tokenized'] as const)('refuses excessive numeric scale before %s treatment or staging',async treatment=>{
 await fixture(`CREATE TABLE ${schema}.numeric_values(amount numeric);INSERT INTO ${schema}.numeric_values VALUES(123.1234567891);ANALYZE ${schema}.numeric_values;`);
 try{
  const r=numericRequest(),c=r.objects[0]!.readPlan.columns[0]!;
  r.aggregateMinGroupSize=1;c.treatment=treatment;r.entitlements[0]!.treatment=treatment;
  if(treatment==='tokenized'||treatment==='masked'){c.exposedType='VARCHAR';c.readAs='text';r.sql='SELECT amount FROM orders';}
  if(treatment==='masked')c.mask={kind:'all'};
  if(treatment==='tokenized')c.token={domain:'premium',canonId:'stdnum1',mode:'number',caseInsensitive:false};
  const proof={attachments:0,appended:[] as unknown[][],closed:[] as string[]},result=await executor(proof).execute(r);
  expect(result).toMatchObject({ok:false,error:{code:'validation_failed',details:{cause:'numeric_not_representable',name:'amount'}}});
  expect(proof.attachments).toBe(0);expect(proof.appended).toEqual([]);expect(JSON.stringify(result)).not.toContain('123.1234567891');
 }finally{await fixture(`DROP TABLE ${schema}.numeric_values`);}
},30000);
it('checks bare numeric arrays as exact strings before conversion',async()=>{
 await fixture(`CREATE TABLE ${schema}.numeric_values(amount numeric[]);INSERT INTO ${schema}.numeric_values VALUES(ARRAY[1.123456789::numeric,2]);ANALYZE ${schema}.numeric_values;`);
 try{
  const r=numericRequest('numeric[]');r.sql='SELECT amount FROM orders';
  const result=await executor().execute(r);expect(result.ok,result.ok?'':result.error.message).toBe(true);
  await fixture(`UPDATE ${schema}.numeric_values SET amount=ARRAY[0.0000000001::numeric]`);
  expect(await executor().execute(r)).toMatchObject({ok:false,error:{details:{cause:'numeric_not_representable'}}});
 }finally{await fixture(`DROP TABLE ${schema}.numeric_values`);}
},30000);
it.each(['name','"char"'])('newly mapped %s text family supports tokenization at the real source boundary',async type=>{
 await fixture(`CREATE TABLE ${schema}.numeric_values(amount ${type});INSERT INTO ${schema}.numeric_values VALUES('Q');ANALYZE ${schema}.numeric_values;`);
 try{
  const r=numericRequest(),c=r.objects[0]!.readPlan.columns[0]!;
  delete c.numericDefault;c.exposedType='VARCHAR';c.readAs='text';c.treatment='tokenized';
  c.token={domain:'identity',canonId:'stdtext1',mode:'text',caseInsensitive:false};r.entitlements[0]!.treatment='tokenized';r.sql='SELECT amount FROM orders';
  const result=await executor().execute(r);expect(result.ok,result.ok?'':result.error.message).toBe(true);
  expect(result).toMatchObject({value:{rows:[[expect.stringMatching(/^v1_identity_/)]]}});
 }finally{await fixture(`DROP TABLE ${schema}.numeric_values`);}
},30000);
