import { DomainError, err, ok, type CompanyId, type IndustryId, type ProjectId, type ProjectName, type Region, type Result, type Timestamp, type UserId } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { RelationshipOutbox } from './relationship-outbox.js';

export type CreateProjectInput = {
  readonly companyId: CompanyId;
  readonly name: ProjectName;
  readonly industryId: IndustryId;
  readonly region: Region;
};

export type CreatedProject = {
  readonly id: ProjectId;
  readonly companyId: CompanyId;
  readonly name: ProjectName;
  readonly industry: { readonly id: IndustryId; readonly name: string; readonly inheritedTermCount: number };
  readonly region: Region;
  readonly createdAt: Timestamp;
};

export interface ProjectCreationRepository {
  create(input: CreateProjectInput, creator: UserId): Promise<Result<{
    project: CreatedProject;
    outboxIds: readonly [bigint, bigint];
  }, DomainError>>;
}

export class CreateProjectService {
  constructor(
    private readonly projects: ProjectCreationRepository,
    private readonly outbox: RelationshipOutbox,
    private readonly authorization: AuthorizationPort,
  ) {}

  async create(input: CreateProjectInput, creator: UserId): Promise<Result<CreatedProject, DomainError>> {
    const created = await this.projects.create(input, creator);
    if (!created.ok) return created;

    // The project, membership and both relationship entries have committed.
    let written = true;
    for (const id of created.value.outboxIds) {
      try {
        if (await this.outbox.dispatchOne(this.authorization, id) === null) written = false;
      } catch {
        // Retain unwritten entries for retry and report incomplete authorization.
        written = false;
      }
    }
    if (written) return ok(created.value.project);
    return err(new DomainError(
      'dependency_unavailable',
      'The project was saved, but administrator access could not be confirmed.',
      { projectId: created.value.project.id },
      true,
    ));
  }
}
