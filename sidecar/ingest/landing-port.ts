import type { VaultRef } from '../../src/platform/vault/index.js';
import type { Result, SourceId, ProjectId, FilingId } from '../../src/shared/kernel/index.js';
import type { LandingReceipt } from '../../src/shared/landing-contract.js';
import type { CedantId, ExtractedColumn, FilingKind, LandingStrategy } from '../../src/modules/ingest/index.js';
export type LandingSource = { sourceId: SourceId; projectId: ProjectId; name: string; credentialRef: VaultRef; strategy: LandingStrategy };
export type LandingInput = { source: LandingSource; filingId: FilingId; cedantId: CedantId; partyCode: string; kind: FilingKind;
  period: string; asAt: string | null; receivedAt: string; fileSha256: string; supersedes: FilingId | null; columns: ExtractedColumn[] };
export interface LandingPort {
  connect(source: LandingSource): Promise<Result<void>>;
  land(input: LandingInput, rows: AsyncIterable<Result<Array<string | null>>>): Promise<Result<LandingReceipt>>;
}
export interface LandingReceiptPort { send(receipt: LandingReceipt): Promise<Result<void>> }
