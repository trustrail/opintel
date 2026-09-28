import {afterAll,beforeAll,expect,it} from 'vitest';
import {QueryOutput} from '../../src/shared/api/mcp.js';
import {queryFixture} from '../fixtures/query/fixture.js';
let f:Awaited<ReturnType<typeof queryFixture>>;
beforeAll(async()=>{f=await queryFixture();await f.addSource('second');},60000);
afterAll(async()=>{await f?.close();},30000);
it('K-007 simple authenticated query completes end to end in under 2 seconds',async()=>{
 const start=performance.now();const response=await f.query('SELECT field_1,field_2 FROM warehouse.public.records ORDER BY field_1');const elapsed=performance.now()-start;
 expect(response.isError,JSON.stringify(response)).not.toBe(true);expect(QueryOutput.parse(response.structuredContent).rows).toHaveLength(7);expect(elapsed).toBeLessThan(2000);
},10000);
it('K-008 cross-source token join completes end to end in under 15 seconds',async()=>{
 const start=performance.now();const response=await f.query('SELECT a.field_1 FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2');const elapsed=performance.now()-start;
 expect(response.isError,JSON.stringify(response)).not.toBe(true);expect(QueryOutput.parse(response.structuredContent).rows).toHaveLength(7);expect(elapsed).toBeLessThan(15000);
},20000);
