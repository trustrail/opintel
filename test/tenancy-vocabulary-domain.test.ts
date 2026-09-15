import { describe, expect, it } from 'vitest';
import {
  CompanyId, IndustryId, IndustrySlug, ProjectId, ProjectName, TermId, TermName,
} from '../src/shared/kernel/index.js';
import { Project } from '../src/modules/tenancy/domain/project.js';
import { VocabularyTerm } from '../src/modules/vocabulary/domain/vocabulary.js';

const companyId = CompanyId('018f8f9d-7f83-7abc-8def-0123456789ab');
const industryId = IndustryId('018f8f9d-7f83-7abc-8def-0123456789ac');
const projectId = ProjectId('018f8f9d-7f83-7abc-8def-0123456789ad');
const termId = TermId('018f8f9d-7f83-7abc-8def-0123456789ae');

describe('tenancy domain', () => {
  it('keeps a project region, company, and industry immutable while allowing a rename', () => {
    const project = new Project(projectId, companyId, industryId, 'eu-west-1', ProjectName('First'), {});
    project.rename(ProjectName('Renamed'));

    expect(project.name).toBe(ProjectName('Renamed'));
    expect(project.region).toBe('eu-west-1');
    expect(project.companyId).toBe(companyId);
    expect(project.industryId).toBe(industryId);
    expect(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(project), 'region')?.set).toBeUndefined();
  });
});

describe('vocabulary domain', () => {
  it('requires exactly one scope target', () => {
    const result = VocabularyTerm.create({
      id: termId, scope: 'industry', industryId, projectId, kind: 'subject',
      name: TermName('policy'), displayName: 'Policy',
    });

    expect(result.ok).toBe(false);
  });

  it('requires a grain rule for a metric formula', () => {
    const result = VocabularyTerm.create({
      id: termId, scope: 'industry', industryId, projectId: null, kind: 'metric',
      name: TermName('loss_ratio'), displayName: 'Loss ratio', formula: 'SUM(loss) / SUM(premium)',
    });

    expect(result.ok).toBe(false);
  });

  it('accepts a project override without copying the industry term', () => {
    const result = VocabularyTerm.create({
      id: termId, scope: 'project', industryId: null, projectId, kind: 'subject',
      name: TermName('policy'), displayName: 'Project policy',
    });

    expect(result.ok).toBe(true);
    expect(IndustrySlug('reinsurance-treaty')).toBe('reinsurance-treaty');
  });
});
