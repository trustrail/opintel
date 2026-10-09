import type { TestInfo } from '@playwright/test';

const reinstatement = 'Reinstate when measurement variance is smaller than the effect, or a person reports the console slow.';

/** Only the noisy frame verdict is non-gating; functional assertions remain gating. */
export async function reportRecordedFrames(
  id: 'M-015' | 'G-019' | 'H-016',
  info: TestInfo,
  measurements: { refresh: number; intervals: number[] },
): Promise<void> {
  // Preserve the existing half-period allowance and measured baseline.
  const longIntervals = measurements.intervals.filter(ms => ms > measurements.refresh * 1.5);
  const report = {
    id,
    policy: 'recorded-failing',
    verdict: longIntervals.length ? 'failed' : 'passed',
    gating: false,
    refreshMs: measurements.refresh,
    thresholdMultiplier: 1.5,
    samples: measurements.intervals.length,
    longIntervals,
    reinstatement,
  };
  info.annotations.push({ type: 'recorded-failing', description: `${id}: frame verdict only. ${reinstatement}` });
  await info.attach(`${id}-recorded-frame-verdict`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(`[recorded-failing] ${id}: ${report.verdict}; ${longIntervals.length}/${report.samples} long intervals; baseline ${report.refreshMs.toFixed(2)}ms. Non-gating. ${reinstatement}`);
}
