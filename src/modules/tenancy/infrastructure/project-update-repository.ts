import { withPlatform } from '../../../platform/db/scope.js';
import { CompanyId, DomainError, IndustryId, ProjectName, Timestamp, err, ok, type ProjectId, type Region } from '../../../shared/kernel/index.js';
import type { ProjectUpdateRepository } from '../application/update-project.js';

type UpdatedProjectRow = {
  company_id: string;
  name: string;
  industry_id: string;
  industry_name: string;
  inherited_term_count: number;
  region: Region;
  created_at: Date;
};

export class PostgresProjectUpdateRepository implements ProjectUpdateRepository {
  async rename(id: ProjectId, name: ProjectName): ReturnType<ProjectUpdateRepository['rename']> {
    try {
      return await withPlatform(async (tx) => {
        const rows = await tx.query<UpdatedProjectRow>(
          `WITH updated AS (
             UPDATE project SET name = $2 WHERE id = $1
             RETURNING company_id, name, industry_id, region, created_at
           )
           SELECT p.*, i.name AS industry_name,
             (SELECT count(*)::int FROM vocabulary_term v
              WHERE v.scope = 'industry' AND v.industry_id = i.id AND v.active) AS inherited_term_count
           FROM updated p JOIN industry i ON i.id = p.industry_id`,
          [id, name],
        );
        const row = rows[0];
        if (row === undefined) return err(new DomainError('not_found', 'The project does not exist.'));
        return ok({
          id, companyId: CompanyId(row.company_id), name: ProjectName(row.name),
          industry: { id: IndustryId(row.industry_id), name: row.industry_name, inheritedTermCount: row.inherited_term_count },
          region: row.region, createdAt: Timestamp(row.created_at),
        });
      });
    } catch (error) {
      // Map the database uniqueness guarantee only after the scope rolls back.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
        && 'constraint' in error && error.constraint === 'project_unique_name') {
        return err(new DomainError('conflict', 'A project with this name already exists in the company.'));
      }
      throw error;
    }
  }
}
