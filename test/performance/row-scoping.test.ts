import {it,expect} from 'vitest';
import {queryFixture} from '../fixtures/query/fixture.js';
import {PostgresRowDecisions} from '../../src/modules/entitlements/infrastructure/row-decisions.js';
import {ObjectId} from '../../src/shared/kernel/index.js';
import {withTenant} from '../../src/platform/db/scope.js';
import {startMeasurement} from '../../scripts/testing/performance-measurement.js';
import {QueryOutput} from '../../src/shared/api/mcp.js';
it('K-007 scoped warm: static row boundary remains below 2000ms',async()=>{
 const f=await queryFixture();try{
  const [o]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));const saved=await new PostgresRowDecisions().save(f.ctx,f.pool,ObjectId(o!.id),'field_2 >= 1002');if(!saved.ok)throw saved.error;
  const finish=startMeasurement('K-007 scoped warm');const response=await f.query('SELECT field_1 FROM warehouse.public.records');const elapsed=finish();
  expect(response.isError,JSON.stringify(response)).not.toBe(true);expect(QueryOutput.parse(response.structuredContent).rows).toHaveLength(6);expect(elapsed).toBeLessThan(2000);
 }finally{await f.close();}
},30000);
