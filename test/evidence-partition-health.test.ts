import {afterEach, expect, it, vi} from 'vitest';
import {BoundedMaintenanceOperation, partitionHorizon, provisioningDeadlineMs, type PartitionCoverage} from '../src/modules/evidence/infrastructure/partition-health.js';
import {observePartitionHorizon} from '../src/modules/evidence/application/partition-monitor.js';

const parents = ['query_run', 'run_completion', 'run_element', 'run_stage'];
const now = new Date('2026-12-31T23:59:59Z');
const bounds = (parent: string, from: string, to: string): PartitionCoverage => ({parent, bound: `FOR VALUES FROM ('${from} 00:00:00+00') TO ('${to} 00:00:00+00')`});
const covered = parents.map(parent => bounds(parent, '2026-12-01', '2027-04-01'));
afterEach(() => { vi.useRealTimers(); });

it('measures complete future UTC months across the year boundary for all four tables', () => {
  expect(partitionHorizon(covered, now)).toEqual({monthsAhead: 3, currentMonthCovered: true});
  expect(partitionHorizon(covered, new Date('2027-01-01T00:00:00Z'))).toEqual({monthsAhead: 2, currentMonthCovered: true});
});
it('a gap or a missing child table limits the horizon even with later partitions present', () => {
  const rows = covered.filter(row => row.parent !== 'run_stage');
  rows.push(bounds('run_stage', '2026-12-01', '2027-01-01'), bounds('run_stage', '2027-02-01', '2027-04-01'));
  expect(partitionHorizon(rows, now)).toEqual({monthsAhead: 0, currentMonthCovered: true});
  expect(partitionHorizon(rows.filter(row => row.parent !== 'run_stage'), now)).toEqual({monthsAhead: 0, currentMonthCovered: false});
});
it('does not count a partly covered month; unexpected bounds are not reported healthy', () => {
  expect(partitionHorizon(parents.map(parent => bounds(parent, '2026-12-01', '2027-02-15')), now).monthsAhead).toBe(1);
  expect(() => partitionHorizon([{parent: 'query_run', bound: 'DEFAULT'}], now)).toThrow();
});
it('bounds each wait and never accumulates underlying operations after timeouts', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const work = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const bounded = new BoundedMaintenanceOperation(work);
  const first = expect(bounded.run()).rejects.toThrow('deadline');
  await vi.advanceTimersByTimeAsync(provisioningDeadlineMs); await first;
  const second = expect(bounded.run()).rejects.toThrow('deadline');
  await vi.advanceTimersByTimeAsync(provisioningDeadlineMs); await second;
  expect(work).toHaveBeenCalledTimes(1);
  finish(); await vi.advanceTimersByTimeAsync(0);
  const next = bounded.run(); await vi.advanceTimersByTimeAsync(0);
  expect(work).toHaveBeenCalledTimes(2); finish(); await next;
});
it('emits the gauge and all three alert conditions, clearing a stale reading on failure', async () => {
  const telemetry = {horizon: vi.fn(), alert: vi.fn()};
  for (const monthsAhead of [3, 2, 1, 0]) await observePartitionHorizon(async () => ({monthsAhead, currentMonthCovered: true}), telemetry);
  expect(telemetry.alert.mock.calls).toEqual([['horizon_low', 'ticket'], ['horizon_low', 'ticket']]);
  await observePartitionHorizon(async () => ({monthsAhead: 0, currentMonthCovered: false}), telemetry);
  expect(telemetry.alert).toHaveBeenLastCalledWith('current_month_uncovered', 'page');
  await observePartitionHorizon(async () => { throw new Error('offline'); }, telemetry);
  expect(telemetry.horizon).toHaveBeenLastCalledWith(null);
  expect(telemetry.alert).toHaveBeenLastCalledWith('horizon_unknown', 'ticket');
});
it('a timed-out catalog read invalidates the horizon and raises the cannot-measure alert', async () => {
  vi.useFakeTimers();
  const telemetry = {horizon: vi.fn(), alert: vi.fn()};
  const read = new BoundedMaintenanceOperation(() => new Promise<{monthsAhead: number; currentMonthCovered: boolean}>(() => {}));
  const observed = observePartitionHorizon(() => read.run(), telemetry);
  await vi.advanceTimersByTimeAsync(provisioningDeadlineMs);
  await observed;
  expect(telemetry.horizon).toHaveBeenCalledWith(null);
  expect(telemetry.alert).toHaveBeenCalledWith('horizon_unknown', 'ticket');
});
