import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { compileViews } from '../../src/modules/entitlements/index.js';
import { fixture, unwrap } from '../fixtures/view-compiler/input.js';

// The performance project runs serially, separately from the functional suite.
// Fixture construction and assertions are outside the measured compilation.
it('VC-15: compiles 5,000 elements in under 200ms in isolation', () => {
  const input = fixture(Array.from({length:100},(_,object)=>({
    name:`records_${object}`,
    columns:Array.from({length:50},(_,column)=>({
      name:`column_${column}`,type:'BIGINT' as const,treatment:'clear' as const,
    })),
  })));
  expect(input.elements).toHaveLength(5000);
  const started = performance.now();
  const result = compileViews(input);
  const elapsed = performance.now()-started;
  console.info(`VC-15: 5,000 elements: ${elapsed.toFixed(1)}ms.`);
  const compiled = unwrap(result);
  expect(compiled.views).toHaveLength(100);
  expect(compiled.views.reduce((count,view)=>count+view.readPlan.columns.length,0)).toBe(5000);
  expect(compiled.omitted).toEqual([]);
  expect(elapsed).toBeLessThan(200);
});
