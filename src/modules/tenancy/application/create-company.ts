import { z } from 'zod';
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
  create(input: CreateCompanyInput, creator: UserId, requestKey: string): Promise<Result<{
    company: CreatedCompany;
    outboxId: bigint;
  }, DomainError>>;
  dispatched(outboxId: bigint): Promise<boolean>;
}

export class CreateCompanyService {
  constructor(
    private readonly companies: CompanyCreationRepository,
    private readonly outbox: RelationshipOutbox,
    private readonly authorization: AuthorizationPort,
  ) {}

  async create(input: CreateCompanyInput, creator: UserId, requestKey: unknown): Promise<Result<CreatedCompany, DomainError>> {
    const key = z.string().trim().min(1).max(200).safeParse(requestKey);
    if (!key.success) return err(new DomainError('validation_failed', 'A valid Idempotency-Key is required to create a company.'));
    const created = await this.companies.create(input, creator, key.data);
    if (!created.ok) return created;

    // The repository resolves only after company, membership and outbox commit.
    try {
      const token = await this.outbox.dispatchOne(this.authorization, created.value.outboxId);
      if (token !== null || await this.companies.dispatched(created.value.outboxId)) return ok(created.value.company);
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
