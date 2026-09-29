import {afterEach, expect, it, vi} from 'vitest';
import {scheduleEvidenceMaintenance} from '../src/platform/http/evidence-maintenance.js';

afterEach(() => { vi.useRealTimers(); });

it('a hung retention pass cannot prevent successive hourly provisioning passes', async () => {
  vi.useFakeTimers();
  const provision = vi.fn(async () => {});
  const retain = vi.fn(() => new Promise<void>(() => {}));
  const failed = vi.fn();
  const stop = scheduleEvidenceMaintenance({provision, retain}, failed);
  await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
  expect(provision).toHaveBeenCalledTimes(3);
  expect(retain).toHaveBeenCalledTimes(1);
  expect(failed).not.toHaveBeenCalled();
  stop();
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(provision).toHaveBeenCalledTimes(3);
});

it('a hung provisioning pass neither overlaps itself nor blocks retention', async () => {
  vi.useFakeTimers();
  const provision = vi.fn(() => new Promise<void>(() => {}));
  const retain = vi.fn(async () => {});
  const stop = scheduleEvidenceMaintenance({provision, retain}, vi.fn());
  await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
  expect(provision).toHaveBeenCalledTimes(1);
  expect(retain).toHaveBeenCalledTimes(4);
  stop();
});

it('failed jobs identify their phase and release their own guard for the next hour', async () => {
  vi.useFakeTimers();
  const provision = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined);
  const retain = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined);
  const failed = vi.fn();
  const stop = scheduleEvidenceMaintenance({provision, retain}, failed);
  await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
  expect(provision).toHaveBeenCalledTimes(2);
  expect(retain).toHaveBeenCalledTimes(3);
  expect(failed.mock.calls).toEqual([['retain'], ['provision']]);
  stop();
});
