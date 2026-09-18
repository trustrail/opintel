import { withPlatform, withTenant } from '../../../platform/db/scope.js';
import { CompanyId, DomainError, IndustryId, ProjectName, Timestamp, err, ok, type Region } from '../../../shared/kernel/index.js';
import type { IndustryMigrationRepository } from '../application/migrate-industry.js';

export class PostgresIndustryMigrationRepository implements IndustryMigrationRepository {
  async migrate(...[input, authorize]: Parameters<IndustryMigrationRepository['migrate']>): ReturnType<IndustryMigrationRepository['migrate']> {
    return withPlatform(async (tx) => {
      // Serialize industry changes and renames, including confirmation validation.
      const [project] = await tx.query<{
        company_id: string; industry_id: string; name: string; region: Region; created_at: Date;
      }>('SELECT company_id, industry_id, name, region, created_at FROM project WHERE id = $1 FOR UPDATE', [input.projectId]);
      if (project === undefined) return err(new DomainError('not_found', 'The project does not exist.'));
      const authorized = await authorize(CompanyId(project.company_id));
      if (!authorized.ok) return authorized;
      if (!input.dryRun && input.confirmation !== project.name) {
        return err(new DomainError('validation_failed', 'Type the project name exactly to confirm the industry migration.'));
      }
      const industries = await tx.query<{ id: string; name: string; term_count: number }>(
        `SELECT i.id, i.name, (SELECT count(*)::int FROM vocabulary_term v
         WHERE v.industry_id = i.id AND v.scope = 'industry' AND v.active) AS term_count
         FROM industry i WHERE i.id = ANY($1::uuid[])`, [[project.industry_id, input.industryId]],
      );
      const from = industries.find((industry) => industry.id === project.industry_id);
      const to = industries.find((industry) => industry.id === input.industryId);
      if (to === undefined) return err(new DomainError('validation_failed', 'The selected industry does not exist.'));
      if (from === undefined) throw new Error('The project industry is missing.');
      if (input.dryRun) {
        // Project vocabulary is RLS protected; the platform scope cannot read it.
        const terms = await withTenant({ projectId: input.projectId, userId: input.userId }, (tenant) => tenant.query<{
          name: string; kind: string; shadowed: boolean;
        }>(
          `SELECT p.name, p.kind, p.active AND EXISTS (
             SELECT 1 FROM vocabulary_term i WHERE i.scope = 'industry' AND i.industry_id = $2
             AND i.active AND i.kind = p.kind AND lower(i.name) = lower(p.name)
           ) AS shadowed FROM vocabulary_term p WHERE p.scope = 'project' AND p.project_id = $1
           ORDER BY p.kind, lower(p.name), p.id`, [input.projectId, input.industryId],
        ));
        return ok({
          from: { id: IndustryId(from.id), name: from.name, termCount: from.term_count },
          to: { id: IndustryId(to.id), name: to.name, termCount: to.term_count },
          shadowedTerms: terms.filter((term) => term.shadowed).map(({ name, kind }) => ({ name, kind })),
          projectTermsRetained: terms.length, entitlementsAffected: 0 as const, confirmationPhrase: project.name,
        });
      }
      await tx.query(
        'UPDATE project SET industry_id = $2, vocabulary_revision = vocabulary_revision + 1 WHERE id = $1',
        [input.projectId, input.industryId],
      );
      return ok({
        id: input.projectId, companyId: CompanyId(project.company_id), name: ProjectName(project.name),
        industry: { id: input.industryId, name: to.name, inheritedTermCount: to.term_count },
        region: project.region, createdAt: Timestamp(project.created_at),
      });
    });
  }
}
