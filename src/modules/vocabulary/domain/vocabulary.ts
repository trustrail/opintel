import {
  DomainError,
  err,
  ok,
  type GrainRule,
  type IndustryId,
  type IndustrySlug,
  type ProjectId,
  type Result,
  type TermId,
  type TermName,
} from '../../../shared/kernel/index.js';

export class Industry {
  constructor(
    readonly id: IndustryId,
    readonly slug: IndustrySlug,
    public name: string,
    public description: string | null,
    public active: boolean,
    public vocabularyVersion: number,
  ) {}
}

export type VocabularyTermInput = {
  id: TermId;
  scope: 'industry' | 'project';
  industryId: IndustryId | null;
  projectId: ProjectId | null;
  kind: 'metric' | 'subject' | 'operation' | 'parameter';
  name: TermName;
  displayName: string;
  formula?: string;
  grainRule?: GrainRule;
};

export class VocabularyTerm {
  private constructor(readonly value: VocabularyTermInput) {}

  static create(input: VocabularyTermInput): Result<VocabularyTerm, DomainError> {
    const hasExactScopeTarget = input.scope === 'industry'
      ? input.industryId !== null && input.projectId === null
      : input.industryId === null && input.projectId !== null;
    if (!hasExactScopeTarget) {
      return err(new DomainError('validation_failed', 'A vocabulary term must have exactly one scope target.'));
    }
    if (input.kind === 'metric' && input.formula !== undefined && input.grainRule === undefined) {
      return err(new DomainError('validation_failed', 'A metric formula requires a grain rule.'));
    }
    return ok(new VocabularyTerm(input));
  }
}
