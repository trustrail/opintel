import { withPlatform } from '../../../platform/db/scope.js';
import { CompanyId, IndustryId, ProjectId, Timestamp, type Region, type UserId } from '../../../shared/kernel/index.js';
import type { TenancyListRepository } from '../application/list-tenancy.js';

export class PostgresTenancyListRepository implements TenancyListRepository {
  async projects(user: UserId, after: string | null, limit: number, includeArchived: boolean, company?: CompanyId): ReturnType<TenancyListRepository['projects']> {
    const rows = await withPlatform((tx) => tx.query<{
      id: string; name: string; region: Region; archived_at: Date | null;
      company_id: string; company_name: string; industry_id: string; industry_name: string;
    }>(
      `SELECT p.id, p.name, p.region, p.archived_at, c.id AS company_id, c.name AS company_name,
              i.id AS industry_id, i.name AS industry_name
       FROM project p JOIN company c ON c.id = p.company_id JOIN industry i ON i.id = p.industry_id
       WHERE ($2::uuid IS NULL OR p.id > $2::uuid)
         AND ($4::boolean OR p.archived_at IS NULL)
         AND ($5::uuid IS NULL OR p.company_id = $5::uuid)
         AND (EXISTS (SELECT 1 FROM company_member cm WHERE cm.company_id = p.company_id AND cm.user_id = $1)
           OR EXISTS (SELECT 1 FROM project_member pm WHERE pm.project_id = p.id AND pm.user_id = $1))
       ORDER BY p.id LIMIT $3`,
      [user, after, limit, includeArchived, company ?? null],
    ));
    return rows.map((row) => ({
      id: ProjectId(row.id), name: row.name, region: row.region,
      archivedAt: row.archived_at === null ? null : Timestamp(row.archived_at),
      company: { id: CompanyId(row.company_id), name: row.company_name },
      industry: { id: IndustryId(row.industry_id), name: row.industry_name },
    }));
  }

  async companies(user: UserId, after: string | null, limit: number): ReturnType<TenancyListRepository['companies']> {
    const rows = await withPlatform((tx) => tx.query<{ id: string; name: string }>(
      `SELECT c.id, c.name FROM company c
       WHERE ($2::uuid IS NULL OR c.id > $2::uuid)
         AND (EXISTS (SELECT 1 FROM company_member cm WHERE cm.company_id = c.id AND cm.user_id = $1)
           OR EXISTS (SELECT 1 FROM project p JOIN project_member pm ON pm.project_id = p.id
                      WHERE p.company_id = c.id AND pm.user_id = $1))
       ORDER BY c.id LIMIT $3`, [user, after, limit],
    ));
    return rows.map((row) => ({ id: CompanyId(row.id), name: row.name }));
  }
}
