import { withPlatform } from '../../../platform/db/scope.js';
import { CompanyId, DomainError, Timestamp, err, ok, type Region, type UserId } from '../../../shared/kernel/index.js';
import type { CompanyCreationRepository, CreateCompanyInput } from '../application/create-company.js';
import type { RelationshipOutbox } from '../application/relationship-outbox.js';

export class PostgresCompanyCreationRepository implements CompanyCreationRepository {
  constructor(private readonly outbox: RelationshipOutbox) {}

  async create(input: CreateCompanyInput, creator: UserId): ReturnType<CompanyCreationRepository['create']> {
    return withPlatform(async (tx) => {
      if (input.defaultIndustryId !== null) {
        const industries = await tx.query<{ id: string }>(
          'SELECT id FROM industry WHERE id = $1', [input.defaultIndustryId],
        );
        if (industries.length === 0) {
          return err(new DomainError('validation_failed', 'The selected default industry does not exist.'));
        }
      }

      const rows = await tx.query<{ id: string; name: string; default_region: Region; created_at: Date }>(
        `INSERT INTO company (name, default_region, default_industry_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, default_region, created_at`,
        [input.name, input.defaultRegion, input.defaultIndustryId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error('Company was not created.');
      const company = {
        id: CompanyId(row.id), name: row.name, defaultRegion: row.default_region,
        defaultIndustryId: input.defaultIndustryId, createdAt: Timestamp(row.created_at),
      };
      await tx.query(
        `INSERT INTO company_member (company_id, user_id, role, granted_by)
         VALUES ($1, $2, 'admin', $2)`,
        [company.id, creator],
      );
      const outboxId = await this.outbox.enqueue(tx, {
        operation: 'touch', resource: { type: 'company', id: company.id },
        relation: 'admin', subject: { type: 'user', id: creator },
      });
      return ok({ company, outboxId });
    });
  }
}
