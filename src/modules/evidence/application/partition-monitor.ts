export interface EvidencePartitionTelemetryPort {
  /** null invalidates the previous observation; it is never a healthy value. */
  horizon(monthsAhead: number | null): void;
  alert(condition: 'horizon_low' | 'current_month_uncovered' | 'horizon_unknown', severity: 'ticket' | 'page'): void;
}

export async function observePartitionHorizon(
  read: () => Promise<{monthsAhead: number; currentMonthCovered: boolean}>,
  telemetry: EvidencePartitionTelemetryPort,
): Promise<void> {
  let coverage: Awaited<ReturnType<typeof read>>;
  try { coverage = await read(); }
  catch {
    telemetry.horizon(null);
    telemetry.alert('horizon_unknown', 'ticket');
    return;
  }
  telemetry.horizon(coverage.monthsAhead);
  if (!coverage.currentMonthCovered) telemetry.alert('current_month_uncovered', 'page');
  else if (coverage.monthsAhead < 2) telemetry.alert('horizon_low', 'ticket');
}
