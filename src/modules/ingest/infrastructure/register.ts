import { withTenant } from '../../../platform/db/scope.js';
import { DomainError, UserId, err, ok, type Result, type ProjectId, type FilingId } from '../../../shared/kernel/index.js';
import { filingListItemSchema, type ArrivalNotice, type ReconciliationReport } from '../../../shared/landing-contract.js';
import type { FilingRegisterRepository, FilingListItem } from '../application/register.js';
const serviceActor = UserId('00000000-0000-4000-8000-000000000001');
export class PostgresFilingRegister implements FilingRegisterRepository {
  async notice(notice: ArrivalNotice): Promise<Result<void>> {
    return withTenant({ projectId: notice.projectId, userId: serviceActor }, async (tx) => {
      const [source] = await tx.query<{ receives_landings: boolean }>('SELECT receives_landings FROM data_source WHERE id=$1 FOR UPDATE', [notice.sourceId]);
      if (!source) return err(new DomainError('not_found', 'The source does not exist in this project.'));
      if (!source.receives_landings) return err(new DomainError('conflict', 'This source does not receive landings.'));
      const [existing] = await tx.query<{ payload: ArrivalNotice }>('SELECT payload FROM arrival_notice WHERE filing_id=$1', [notice.filingId]);
      if (existing && (existing.payload.sourceId !== notice.sourceId || existing.payload.fileSha256 !== notice.fileSha256 || existing.payload.receivedAt !== notice.receivedAt))
        return err(new DomainError('conflict', 'The filing identity cannot change.'));
      await tx.query(`INSERT INTO arrival_notice (filing_id, project_id, source_id, revision, payload) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (filing_id) DO UPDATE SET revision=EXCLUDED.revision, payload=EXCLUDED.payload
        WHERE arrival_notice.revision < EXCLUDED.revision AND arrival_notice.source_id=EXCLUDED.source_id`,
      [notice.filingId, notice.projectId, notice.sourceId, notice.revision, JSON.stringify(notice)]);
      return ok(undefined);
    });
  }
  async reconcile(report: ReconciliationReport, projectId: ProjectId): Promise<Result<void>> {
    return withTenant({ projectId, userId: serviceActor }, async (tx) => {
      const [source] = await tx.query('SELECT id FROM data_source WHERE id=$1 AND receives_landings', [report.sourceId]);
      if (!source) return err(new DomainError('not_found', 'The landing source does not exist in this project.'));
      await tx.query(`INSERT INTO reconciliation_report (source_id,project_id,checked_at,payload) VALUES ($1,$2,$3,$4)
        ON CONFLICT (source_id) DO UPDATE SET checked_at=EXCLUDED.checked_at,payload=EXCLUDED.payload
        WHERE reconciliation_report.checked_at < EXCLUDED.checked_at`, [report.sourceId,projectId,report.checkedAt,JSON.stringify(report)]);
      return ok(undefined);
    });
  }
  async list(projectId: ProjectId, userId: UserId, after: FilingId | null, limit: number): Promise<Result<FilingListItem[]>> {
    return withTenant({ projectId, userId }, async (tx) => {
      const rows = await tx.query<{ notice: ArrivalNotice; supersedes: string | null; row_count: number | null }>(`
        SELECT a.payload AS notice, r.payload->>'supersedes' AS supersedes, (r.payload->>'rowCount')::bigint::float8 AS row_count
        FROM arrival_notice a LEFT JOIN landing_receipt r ON r.filing_id=a.filing_id AND r.source_id=a.source_id
        WHERE ($1::uuid IS NULL OR a.filing_id>$1) ORDER BY a.filing_id LIMIT $2`, [after,limit]);
      return ok(rows.map((row) => filingListItemSchema.parse({ ...row.notice, supersedes: row.supersedes, rowCount: row.row_count })));
    });
  }
}
