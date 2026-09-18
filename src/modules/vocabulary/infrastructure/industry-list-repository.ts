import { withPlatform } from '../../../platform/db/scope.js';
import { IndustryId } from '../../../shared/kernel/index.js';
import type { IndustryListEntry, IndustryListRepository } from '../application/list-industries.js';

export class PostgresIndustryListRepository implements IndustryListRepository {
  async list(): Promise<IndustryListEntry[]> {
    const rows = await withPlatform((tx) => tx.query<Omit<IndustryListEntry, 'id'> & { id: string }>(
      `SELECT i.id, i.slug, i.name, i.description,
         (SELECT count(*)::int FROM vocabulary_term v WHERE v.industry_id = i.id AND v.scope = 'industry' AND v.active) AS "inheritedTermCount",
         EXISTS (SELECT 1 FROM demo_source_template d WHERE d.industry_id = i.id AND d.active) AS "hasDemoPack"
       FROM industry i WHERE i.active ORDER BY i.name, i.id`,
    ));
    return rows.map((row) => ({ ...row, id: IndustryId(row.id) }));
  }
}
