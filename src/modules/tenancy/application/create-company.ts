import { DomainError, err, ok, type CompanyId, type IndustryId, type Region, type Result, type Timestamp, type UserId } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { RelationshipOutbox } from './relationship-outbox.js';

export type CreateCompanyInput = {
  readonly name: string;
  readonly defaultRegion: Region;
  readonly defaultIndustryId: IndustryId | null;
};

export type CreatedCompany = CreateCompanyInput & {
  readonly id: CompanyId;
  readonly createdAt: Timestamp;
};

export interface CompanyCreationRepository {
  create(input: CreateCompanyInput, creator: UserId): Promise<Result<{
    company: CreatedCompany;
    outboxId: bigint;
  }, DomainError>>;
}

export class CreateCompanyService {
  constructor(
    private readonly companies: CompanyCreationRepository,
    private readonly outbox: RelationshipOutbox,
    private readonly authorization: AuthorizationPort,
  ) {}

  async create(input: CreateCompanyInput, creator: UserId): Promise<Result<CreatedCompany, DomainError>> {
    const created = await this.companies.create(input, creator);
    if (!created.ok) return created;

    // The repository resolves only after company, membership and outbox commit.
    try {
      const token = await this.outbox.dispatchOne(this.authorization, created.value.outboxId);
      if (token !== null) return ok(created.value.company);
    } catch {
      // The committed outbox entry remains available for retry.
    }
    return err(new DomainError(
      'dependency_unavailable',
      'The company was saved, but administrator access could not be confirmed.',
      { companyId: created.value.company.id },
      true,
    ));
  }
}
