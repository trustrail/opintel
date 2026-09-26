import { readFile } from 'node:fs/promises';
import { beforeEach, afterEach, it, expect } from 'vitest';
import { resetDatabaseBeforeEach } from '../database-fixture.js';
import { bulkFixture, bulkServer, type BulkFixture } from '../fixtures/bulk-entitlements/fixture.js';
import { SpiceDbAuthorizationPort } from '../../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import { SystemClock } from '../../src/shared/kernel/index.js';
import { withTenant } from '../../src/platform/db/scope.js';

let fixture:BulkFixture,host:Awaited<ReturnType<typeof bulkServer>>,authorization:SpiceDbAuthorizationPort;
resetDatabaseBeforeEach('company');
beforeEach(async()=>{
  fixture=await bulkFixture(500);
  const endpoint=process.env.SPICEDB_ENDPOINT,token=process.env.SPICEDB_TOKEN;if(!endpoint||!token)throw new Error('SpiceDB is required.');
  authorization=new SpiceDbAuthorizationPort({endpoint,token,clock:new SystemClock(),stalenessCeilingMs:0});
  await authorization.loadSchema(await readFile('docs/opintel-schema.zed','utf8'));
  await authorization.write([{operation:'touch',resource:{type:'project',id:fixture.ctx.projectId},relation:'admin',subject:{type:'user',id:fixture.ctx.userId}}]);
  host=await bulkServer(fixture,authorization);
},30_000);
afterEach(async()=>{await host?.close();authorization?.close();});
it('H-010: bulk set 500 elements through HTTP and real authorization completes under 3 seconds',async()=>{
  const start=performance.now();
  const response=await host.post({...fixture.body,treatment:'clear',justification:'Approved for reporting'});
  const body:unknown=await response.json();
  const elapsed=performance.now()-start;
  console.info(`H-010: 500 elements, HTTP through commit: ${elapsed.toFixed(1)}ms.`);
  expect(response.status).toBe(200);expect(body).toMatchObject({count:500,treatment:'clear'});
  expect(elapsed).toBeLessThan(3000);
  const rows=await withTenant(fixture.ctx,tx=>tx.query<{count:number}>("SELECT count(*)::int AS count FROM entitlement WHERE treatment='clear' AND justification='Approved for reporting'"));
  expect(rows).toEqual([{count:500}]);
  expect(await withTenant(fixture.ctx,tx=>tx.query('SELECT count FROM bulk_decision'))).toEqual([{count:500}]);
},30_000);
