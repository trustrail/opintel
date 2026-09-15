import type { CompanyId, IndustryId, JsonObject, ProjectId, ProjectName, Region } from '../../../shared/kernel/index.js';

export class Company {
  constructor(
    readonly id: CompanyId,
    readonly name: string,
    readonly defaultIndustryId: IndustryId | null,
    readonly defaultRegion: Region,
  ) {}
}

export class Project {
  constructor(
    readonly id: ProjectId,
    readonly companyId: CompanyId,
    readonly industryId: IndustryId,
    readonly region: Region,
    public name: ProjectName,
    public settings: JsonObject,
  ) {}

  rename(name: ProjectName): void {
    this.name = name;
  }
}
