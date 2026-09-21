import { notify, type ProjectEvents } from '../../../platform/sse/port.js';
import { withTenant } from '../../../platform/db/scope.js';
import { DomainError, UserId, err, ok, type Result } from '../../../shared/kernel/index.js';
import type { LandingReceipt } from '../../../shared/landing-contract.js';
import type { LandingReceiptRepository } from '../application/landing-receipts.js';

export class PostgresLandingReceiptRepository implements LandingReceiptRepository {
  constructor(private readonly events?: ProjectEvents) {}
  async accept(receipt: LandingReceipt): Promise<Result<void>> {
    // This is the authenticated sidecar service actor, not a browser user. The
    // pinned certificate grants this route only; RLS still binds the project.
    const result = await withTenant({ projectId: receipt.projectId, userId: UserId('00000000-0000-4000-8000-000000000001') }, async (tx) => {
      const [source] = await tx.query<{ receives_landings: boolean; landing_strategy: string | null }>('SELECT receives_landings, landing_strategy FROM data_source WHERE id=$1 FOR UPDATE', [receipt.sourceId]);
      if (!source) return err(new DomainError('not_found', 'The landing source does not exist in this project.'));
      if (!source.receives_landings) return err(new DomainError('conflict', 'This source does not receive landings.'));
      if (source.landing_strategy !== null && source.landing_strategy !== receipt.strategy)
        return err(new DomainError('conflict', `Landing strategy is ${source.landing_strategy}; received ${receipt.strategy}.`));
      const [existing] = await tx.query<{ matches: boolean }>('SELECT payload=$2::jsonb AS matches FROM landing_receipt WHERE filing_id=$1', [receipt.filingId, JSON.stringify(receipt)]);
      if (existing && !existing.matches) return err(new DomainError('conflict', 'The filing ID already has a different landing receipt.'));
      await tx.query('UPDATE data_source SET landing_strategy=$2, first_landed_at=COALESCE(first_landed_at,$3::timestamptz) WHERE id=$1', [receipt.sourceId, receipt.strategy, receipt.landedAt]);
      if (!existing) await tx.query('INSERT INTO landing_receipt (filing_id, project_id, source_id, payload) VALUES ($1,$2,$3,$4)', [receipt.filingId, receipt.projectId, receipt.sourceId, JSON.stringify(receipt)]);
      return ok(undefined);
    });
    if (result.ok) await notify(this.events, receipt.projectId, { type: 'filing.arrived', sourceId: receipt.sourceId, filingId: receipt.filingId });
    return result;
  }
}
