import {afterAll,beforeAll,expect,it} from 'vitest';
import {QueryOutput} from '../../src/shared/api/mcp.js';
import {startMeasurement} from '../../scripts/testing/performance-measurement.js';
import {queryFixture} from '../fixtures/query/fixture.js';
let f:Awaited<ReturnType<typeof queryFixture>>;
const sql = 'SELECT field_1,field_2 FROM warehouse.public.records ORDER BY field_1';
beforeAll(async()=>{f=await queryFixture();await f.addSource('second');},60000);
afterAll(async()=>{await f?.close();},30000);
it('K-007 cold: first authenticated query (recorded, budget pending three data-gate occasions)',async context=>{
 const finish=startMeasurement('K-007 cold');
 const deadline=()=>{
  // Vitest aborts this signal on its deadline. Tag that event at the body,
  // not by matching timeout wording; hooks and query exceptions stay hard failures.
  if(context.signal.reason instanceof Error)
   Object.assign(context.signal.reason,{code:'OPINTEL_COLD_MEASUREMENT_DEADLINE'});
 };
 context.signal.addEventListener('abort',deadline,{once:true});
 try {
  const response=await f.client.callTool({name:'opintel.query',arguments:{sql}},undefined,{signal:context.signal});
  const elapsed=finish();
  console.info(JSON.stringify({measurement:'K-007 cold',status:'recorded-failing',reason:'cold budget not yet established',budgetMs:null,milliseconds:elapsed}));
  expect(response.isError,JSON.stringify(response)).not.toBe(true);expect(QueryOutput.parse(response.structuredContent).rows).toHaveLength(7);
 }finally{context.signal.removeEventListener('abort',deadline);}
},10000);
it('K-007 warm: identical authenticated query after the unmeasured suite warm-up completes in under 2 seconds',async()=>{
 const finish=startMeasurement('K-007 warm');const response=await f.query(sql);const elapsed=finish();
 expect(response.isError,JSON.stringify(response)).not.toBe(true);expect(QueryOutput.parse(response.structuredContent).rows).toHaveLength(7);expect(elapsed).toBeLessThan(2000);
},10000);
it('K-008 cross-source token join completes end to end in under 15 seconds',async()=>{
 const finish=startMeasurement('K-008');const response=await f.query('SELECT a.field_1 FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2');const elapsed=finish();
 expect(response.isError,JSON.stringify(response)).not.toBe(true);expect(QueryOutput.parse(response.structuredContent).rows).toHaveLength(7);expect(elapsed).toBeLessThan(15000);
},20000);
