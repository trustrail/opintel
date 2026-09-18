import { DomainError, err, ok, type CompanyId, type IndustryId, type ProjectId, type Result, type UserId } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { CreatedProject } from './create-project.js';

export type IndustryMigrationInput = {
  projectId: ProjectId; industryId: IndustryId; userId: UserId; confirmation: string; dryRun: boolean;
};
type PreviewIndustry = { id: IndustryId; name: string; termCount: number };
export type IndustryMigrationPreview = {
  from: PreviewIndustry; to: PreviewIndustry;
  shadowedTerms: { name: string; kind: string }[];
  projectTermsRetained: number; entitlementsAffected: 0; confirmationPhrase: string;
};
export interface IndustryMigrationRepository {
  migrate(input: IndustryMigrationInput, authorize: (company: CompanyId) => Promise<Result<void, DomainError>>):
    Promise<Result<CreatedProject | IndustryMigrationPreview, DomainError>>;
}

export class MigrateIndustryService {
  constructor(private readonly repository: IndustryMigrationRepository, private readonly authorization: AuthorizationPort) {}

  async migrate(input: IndustryMigrationInput): Promise<Result<CreatedProject | IndustryMigrationPreview, DomainError>> {
    return this.repository.migrate(input, async (companyId) => {
      const checks = await this.authorization.checkMany([
        { resource: { type: 'project', id: input.projectId }, permission: 'administer', subject: { type: 'user', id: input.userId } },
        { resource: { type: 'company', id: companyId }, permission: 'administer', subject: { type: 'user', id: input.userId } },
      ]);
      if (checks.length !== 2 || checks.some((check) => !check.allowed)) {
        return err(new DomainError('forbidden', 'You must administer both the project and its company to migrate industry.'));
      }
      return ok(undefined);
    });
  }
}
