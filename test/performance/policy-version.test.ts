import { beforeEach,expect,it } from 'vitest';
import { PostgresEntitlementReader } from '../../src/modules/entitlements/index.js';
import { resetDatabaseBeforeEach } from '../database-fixture.js';
import { policyFixture,unwrap,type PolicyFixture } from '../fixtures/policy-version/fixture.js';
let f:PolicyFixture;
resetDatabaseBeforeEach('company');beforeEach(async()=>{f=await policyFixture(500);},30_000);
it('H-002: a clear decision and fresh compilation complete under two seconds',async()=>{
 const reader=new PostgresEntitlementReader(),before=await f.version();
 expect(unwrap(await reader.definition(f.ctx,f.pool)).views).toEqual([]);
 const start=performance.now();
 const decision=await f.set('clear');
 const next=unwrap(await reader.definition(f.ctx,f.pool));
 const elapsed=performance.now()-start;
 console.info(`H-002: commit and fresh compilation of 500 clear fields: ${elapsed.toFixed(1)}ms.`);
 expect(decision.status).toBe(200);expect(await f.version()).toBe(before+1);
 expect(next.views).toHaveLength(1);expect(next.omitted).toEqual([]);
 expect(next.views[0]!.ddl.match(/"field_\d+"/gu)).toHaveLength(500);
 expect(elapsed).toBeLessThan(2000);
},30_000);
