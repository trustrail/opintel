import { describe, expect, it } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform } from '../src/platform/db/scope.js';

describe('industry pack filing labels', () => {
  resetDatabaseBeforeEach('industry');
  it('supplies Cedant and meaningful filing kinds only from the reinsurance vocabulary', async () => {
    const terms = await withPlatform((tx) => tx.query(`SELECT i.slug,t.kind,t.name,t.display_name,t.param_type,t.enum_values
      FROM vocabulary_term t JOIN industry i ON i.id=t.industry_id
      WHERE t.scope='industry' AND t.name IN ('filing_party','filing_kind') ORDER BY t.name`));
    expect(terms).toEqual([
      { slug: 'reinsurance-treaty', kind: 'parameter', name: 'filing_kind', display_name: 'Filing kind', param_type: 'enum', enum_values: ['premium', 'claims', 'submission'] },
      { slug: 'reinsurance-treaty', kind: 'subject', name: 'filing_party', display_name: 'Cedant', param_type: null, enum_values: [] },
    ]);
  });
});
