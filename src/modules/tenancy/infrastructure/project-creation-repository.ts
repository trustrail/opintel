import { withPlatform } from '../../../platform/db/scope.js';
import { DomainError, ProjectId, Timestamp, err, ok, type UserId } from '../../../shared/kernel/index.js';
import type { CreateProjectInput, ProjectCreationRepository } from '../application/create-project.js';
import type { RelationshipOutbox } from '../application/relationship-outbox.js';

export class PostgresProjectCreationRepository implements ProjectCreationRepository {
  constructor(private readonly outbox: RelationshipOutbox) {}

  async create(input: CreateProjectInput, creator: UserId): ReturnType<ProjectCreationRepository['create']> {
    return withPlatform(async (tx) => {
      const companies = await tx.query<{ id: string }>('SELECT id FROM company WHERE id = $1', [input.companyId]);
      if (companies.length === 0) return err(new DomainError('not_found', 'The company does not exist.'));
      const industries = await tx.query<{ name: string; inherited_term_count: number }>(
        `SELECT i.name, (SELECT count(*)::int FROM vocabulary_term v
         WHERE v.scope = 'industry' AND v.industry_id = i.id AND v.active) AS inherited_term_count
         FROM industry i WHERE i.id = $1`,
        [input.industryId],
      );
      const industry = industries[0];
      if (industry === undefined) return err(new DomainError('validation_failed', 'The selected industry does not exist.'));

      const rows = await tx.query<{ id: string; created_at: Date }>(
        `INSERT INTO project (company_id, name, industry_id, region)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, lower(name)) DO NOTHING
         RETURNING id, created_at`,
        [input.companyId, input.name, input.industryId, input.region],
      );
      const row = rows[0];
      if (row === undefined) return err(new DomainError('conflict', 'A project with this name already exists in the company.'));
      const project = {
        id: ProjectId(row.id), companyId: input.companyId, name: input.name,
        industry: { id: input.industryId, name: industry.name, inheritedTermCount: industry.inherited_term_count },
        region: input.region, createdAt: Timestamp(row.created_at),
      };
      await tx.query(
        `INSERT INTO project_member (project_id, user_id, role, granted_by)
         VALUES ($1, $2, 'admin', $2)`,
        [project.id, creator],
      );
      const companyRelationshipId = await this.outbox.enqueue(tx, {
        operation: 'touch', resource: { type: 'project', id: project.id },
        relation: 'company', subject: { type: 'company', id: input.companyId },
      });
      const adminRelationshipId = await this.outbox.enqueue(tx, {
        operation: 'touch', resource: { type: 'project', id: project.id },
        relation: 'admin', subject: { type: 'user', id: creator },
      });
      return ok({ project, outboxIds: [companyRelationshipId, adminRelationshipId] as const });
    });
  }
}
