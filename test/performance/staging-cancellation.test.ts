import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {Client} from 'pg';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {StagedExecutor} from '../../sidecar/execution/application/execute.js';
import {PostgresStagingSource} from '../../sidecar/execution/infrastructure/postgres-source.js';
import {PostgresSourceScope} from '../../sidecar/infrastructure/postgres-source-scope.js';
import {DuckDBSessionEngine} from '../../sidecar/session/index.js';
import {SidecarTokenizer,IanaZoneResolver} from '../../sidecar/tokenize/index.js';
import {executionRequest} from '../../src/shared/execution-contract.js';
import {ok} from '../../src/shared/kernel/index.js';
const schema='cancel_'+randomUUID().replaceAll('-','');
async function fixture(sql:string){const c=new Client({connectionString:process.env.TEST_DATABASE_URL});try{await c.connect();return (await c.query(sql)).rows as unknown[];}finally{await c.end();}}
beforeAll(async()=>{await fixture(`CREATE SCHEMA ${schema};CREATE VIEW ${schema}.slow AS SELECT 1 AS id WHERE pg_sleep(30) IS NOT NULL`);},30000);
afterAll(async()=>{await fixture(`DROP SCHEMA ${schema} CASCADE`);},30000);
for(const treatment of ['clear','masked'] as const)it(`J-021 ${treatment} source cancellation closes the source and both sessions within 2s`,async()=>{
 const sourceId=randomUUID(),elementId=randomUUID(),scope=new PostgresSourceScope({resolve:async()=>process.env.TEST_DATABASE_URL!},{maxConnectionsPerSource:1,statementTimeoutMs:30000,operationTimeoutMs:40000});
 const source=new PostgresStagingSource(scope,new SidecarTokenizer({resolveBytes:async()=>Buffer.alloc(32,1)},new IanaZoneResolver()));
 // The fixture view deliberately sleeps. Supply its known cardinality here:
 // the separate governor tests prove that an unknown production estimate refuses.
 const closed:string[]=[];
 const executor=new StagedExecutor({estimate:async()=>ok(1),plain:source.plain.bind(source),treated:source.treated.bind(source)},r=>{
  const engine=new DuckDBSessionEngine(undefined,undefined,resolve('tmp/duckdb-extensions/postgres_scanner.duckdb_extension'),r.limits);
  return {open:async role=>{const s=await engine.open(role),close=s.close;s.close=()=>{closed.push(role);close();};return s;}};
 });
 const request=executionRequest.parse({requestId:'cancellation',projectId:randomUUID(),poolId:randomUUID(),policyVersion:1,sql:'SELECT id FROM slow',namespace:{catalog:'warehouse',schema:'public'},sources:[{sourceId,credentialRef:'secret://test/source'}],entitlements:[{elementId,treatment}],objects:[{catalog:'warehouse',schema:'public',name:'slow',sourceId,readPlan:{catalog:'warehouse',schema,object:'slow',columns:[{sourceIdentifier:'id',exposedName:'id',exposedType:treatment==='clear'?'INTEGER':'VARCHAR',elementId,treatment,readAs:treatment==='clear'?'native':'text',...(treatment==='masked'?{mask:{kind:'all'}}:{})}]}}],aggregateMinGroupSize:5,limits:{memoryMb:64,threads:1,timeoutMs:40000,rowLimit:2,concurrency:1},entitlementContext:null});
 const signal=new AbortController(),pending=executor.execute(request,signal.signal);
 try{
  await vi.waitFor(async()=>{expect((await fixture(`SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND (query LIKE '%${schema}%' OR application_name='opintel-sidecar-connector')`)).length).toBeGreaterThan(0);},{timeout:10000,interval:20});
  const start=performance.now();signal.abort();expect(await pending).toMatchObject({ok:false,error:{code:'budget_exceeded'}});
  expect(closed).toEqual(['agent','privileged','agent','privileged']);
  expect(await fixture(`SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND (query LIKE '%${schema}%' OR application_name='opintel-sidecar-connector')`)).toHaveLength(0);
  expect(performance.now()-start).toBeLessThan(2000);
 }finally{signal.abort();await pending;}
},30000);
