import {expect,it} from 'vitest';
import {withPlatform} from '../../src/platform/db/scope.js';
import {warmPerformanceProcess,warmedLookupClient} from '../../scripts/testing/performance-warmup.js';

// Non-latency lifecycle regression: the persistent worker must keep its shared
// resources usable across files, then close them at worker teardown, not at
// onAfterRunFiles (which Vitest calls separately for each file).
it('performance worker resources remain usable after earlier files',async()=>{
  await warmPerformanceProcess();
  expect(warmedLookupClient()).toBeDefined();
  expect(await withPlatform(tx=>tx.query<{value:number}>('SELECT 1 AS value'))).toEqual([{value:1}]);
});
