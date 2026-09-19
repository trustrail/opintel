import type { ArrivalNotice, ReconciliationReport, filingListItemSchema } from '../../../shared/landing-contract.js';
import type { FilingId, ProjectId, UserId, Result } from '../../../shared/kernel/index.js';
import type { z } from 'zod';
export type FilingListItem = z.infer<typeof filingListItemSchema>;
export interface FilingRegisterRepository {
  notice(notice: ArrivalNotice): Promise<Result<void>>;
  reconcile(report: ReconciliationReport, projectId: ProjectId): Promise<Result<void>>;
  list(projectId: ProjectId, userId: UserId, after: FilingId | null, limit: number): Promise<Result<FilingListItem[]>>;
}
