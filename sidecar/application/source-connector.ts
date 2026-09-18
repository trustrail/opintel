import type { DomainError, ElementId, ProjectId, Result, SourceId } from '../../src/shared/kernel/index.js';
import type { VaultRef } from '../../src/platform/vault/types.js';
import type { CatalogSnapshot, TopValue } from '../../src/modules/sources/index.js';

/** Implemented by the sidecar's vault integration, never by the application. */
export interface SourceCredentialResolver {
  resolve(ref: VaultRef): Promise<string>;
}
export type SamplingAudit = {
  requestId: string; projectId: ProjectId; sourceId: SourceId; elementIds: ElementId[];
  consentGiven: boolean; outcome: 'started' | 'completed' | 'refused' | 'failed';
};
export interface SamplingAuditPort {
  record(event: SamplingAudit): Promise<void>;
}

/** The S1 HTTP host validates/authenticates its caller and maps errors to HTTP.
 * In particular, forbidden maps to 403. No listener is constructed here. */
export interface SidecarConnector {
  testConnection(request: unknown): Promise<Result<{ reachable: true } | { reachable: false; reason: string }, DomainError>>;
  introspect(request: unknown): Promise<Result<{ snapshot: CatalogSnapshot }, DomainError>>;
  sampleTopValues(request: unknown): Promise<Result<{ values: Record<string, TopValue[]> }, DomainError>>;
  estimateRowCount(request: unknown): Promise<Result<{ rows: number | null }, DomainError>>;
}
