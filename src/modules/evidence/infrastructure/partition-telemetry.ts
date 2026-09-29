import type {EvidencePartitionTelemetryPort} from '../application/partition-monitor.js';

/** Item 1.15 wires a deployment receiver. Until then, emit fixed structured fields. */
export class LoggedEvidencePartitionTelemetry implements EvidencePartitionTelemetryPort {
  horizon(monthsAhead: number | null): void {
    console.info(JSON.stringify({event: 'evidence.partition_horizon', timestamp: new Date().toISOString(),
      metric: 'opintel_evidence_partition_horizon_months', value: monthsAhead,
      status: monthsAhead === null ? 'unknown' : 'measured'}));
  }
  alert(condition: Parameters<EvidencePartitionTelemetryPort['alert']>[0], severity: 'ticket' | 'page'): void {
    console.warn(JSON.stringify({event: 'evidence.partition_alert', timestamp: new Date().toISOString(), condition, severity}));
  }
}
