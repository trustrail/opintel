import {expect,it,vi} from 'vitest';
import {EvidenceMaintenance} from '../src/modules/evidence/index.js';
import {readPartitionHorizon} from '../src/modules/evidence/infrastructure/partition-health.js';

it('reads actual PostgreSQL partition bounds through scope and reports the provisioned horizon', async () => {
  const telemetry={horizon:vi.fn(),alert:vi.fn()};
  await new EvidenceMaintenance(undefined,telemetry).provision();
  const coverage=await readPartitionHorizon();
  expect(coverage.currentMonthCovered).toBe(true);
  expect(coverage.monthsAhead).toBeGreaterThanOrEqual(3);
  expect(telemetry.horizon).toHaveBeenCalledWith(coverage.monthsAhead);
  expect(telemetry.alert).not.toHaveBeenCalled();
});
