import { ok, type DomainError, type IndustryId, type Result } from '../../../shared/kernel/index.js';

export type IndustryListEntry = {
  id: IndustryId; slug: string; name: string; description: string | null;
  inheritedTermCount: number; hasDemoPack: boolean;
};
export interface IndustryListRepository { list(): Promise<IndustryListEntry[]> }
export class ListIndustriesService {
  constructor(private readonly industries: IndustryListRepository) {}
  async list(): Promise<Result<IndustryListEntry[], DomainError>> { return ok(await this.industries.list()); }
}
