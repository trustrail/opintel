import type { VaultRef } from '../../src/platform/vault/index.js';
import type { Result, SourceId, ProjectId, FilingId } from '../../src/shared/kernel/index.js';
import type { LandingReceipt } from '../../src/shared/landing-contract.js';
import type { PartyId, ExtractedColumn, LandingStrategy } from '../../src/modules/ingest/index.js';
export type LandingSource = { sourceId: SourceId; projectId: ProjectId; name: string; credentialRef: VaultRef; strategy: LandingStrategy };
export type LandingInput = { source: LandingSource; filingId: FilingId; partyId: PartyId; partyCode: string; kind: string;
  period: string; asAt: string | null; receivedAt: string; fileSha256: string; supersedes: FilingId | null; columns: ExtractedColumn[] };
export interface LandingPort {
  committed?(source: LandingSource): Promise<Result<LandingReceipt[]>>;
  connect(source: LandingSource): Promise<Result<void>>;
  land(input: LandingInput, rows: AsyncIterable<Result<Array<string | null>>>): Promise<Result<LandingReceipt>>;
}
export interface LandingReceiptPort { send(receipt: LandingReceipt): Promise<Result<void>> }

export interface RegisterDeliveryPort {
  notice(notice: import('../../src/shared/landing-contract.js').ArrivalNotice): Promise<Result<void>>;
  reconcile(report: import('../../src/shared/landing-contract.js').ReconciliationReport, projectId: ProjectId): Promise<Result<void>>;
}
