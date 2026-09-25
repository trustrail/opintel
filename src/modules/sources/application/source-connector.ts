import type { DomainError, ElementId, ObjectId, ProjectId, Result, SourceId, Timestamp } from '../../../shared/kernel/index.js';
import type { SecretRef } from '../../../platform/secrets/types.js';

export type SourceKind = 'postgres' | 'demo';
export type ObjectRef = { id: ObjectId; sourceId: SourceId; schema: string; name: string };
export type TopValue = { value: string; frequency: number };
export type CatalogSnapshot = {
  takenAt: Timestamp;
  objects: Array<{
    schema: string; name: string; kind: 'table' | 'view' | 'fileset'; rowEstimate: number | null;
    columns: Array<{
      sourceIdentifier: string; stableRef: string | null; ordinal: number;
      sourceType: string; nullable: boolean; isKey: boolean; description: string | null;
    }>;
  }>;
  foreignKeys: Array<{ fromObject: string; fromColumn: string; toObject: string; toColumn: string }>;
};

export interface SourceConnector {
  readonly kind: SourceKind;
  testConnection(ref: SecretRef, signal?: AbortSignal): Promise<Result<void, DomainError>>;
  introspect(ref: SecretRef, include: string[], signal?: AbortSignal): Promise<Result<CatalogSnapshot, DomainError>>;
  sampleTopValues(ref: SecretRef, elements: ElementId[], limit: number, signal?: AbortSignal): Promise<Result<Map<ElementId, TopValue[]>, DomainError>>;
  estimateRowCount(ref: SecretRef, object: ObjectRef, signal?: AbortSignal): Promise<Result<number | null, DomainError>>;
}

// The application binds a connector to a source and supplies current consent
// and catalogue addresses. Resolving these never contacts the source database.
export interface SourceConnectorContext {
  projectId: ProjectId;
  sourceId: SourceId;
  requestId: string;
  sampling(elements: ElementId[]): Promise<Result<{
    consentGiven: boolean;
    elements: Array<{ elementId: ElementId; schema: string; object: string; column: string }>;
  }, DomainError>>;
}
