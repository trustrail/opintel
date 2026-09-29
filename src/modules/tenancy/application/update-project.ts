import type { DomainError, ProjectId, ProjectName, Result, UserId } from '../../../shared/kernel/index.js';
import type { CreatedProject } from './create-project.js';

export interface ProjectUpdateRepository {
  rename(id: ProjectId, name: ProjectName, actor:UserId): Promise<Result<CreatedProject, DomainError>>;
}

export class UpdateProjectService {
  constructor(private readonly projects: ProjectUpdateRepository) {}

  async rename(id: ProjectId, name: ProjectName, actor:UserId): Promise<Result<CreatedProject, DomainError>> {
    return this.projects.rename(id, name, actor);
  }
}
