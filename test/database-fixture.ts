import { readFile } from 'node:fs/promises';
import { beforeEach } from 'vitest';
import { withPlatformAdmin } from '../src/platform/db/scope.js';

type FixtureTable = 'industry' | 'company' | 'user_account' | 'mail_outbox' | 'relationship_outbox';

// Register before a suite's fixture-building hooks. CASCADE clears dependent
// rows (tokens, invitations, memberships, vocabulary, etc.) as well as roots.
// Vitest serializes files/tests sharing this database; application transactions
// and concurrent requests within a test remain real and independent.
export function resetDatabaseBeforeEach(...tables: [FixtureTable, ...FixtureTable[]]): void {
  // Reseeding executes real migration SQL; give that work headroom without
  // changing the timeout of test bodies or unrelated reset hooks.
  beforeEach(async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required for database fixtures.');
    await withPlatformAdmin({ actor: { kind: 'system', name: 'test-database-reset' } }, async (tx) => {
      const identifiers = [...new Set(tables)].sort().map((table) => `"${table}"`).join(', ');
      await tx.query(`TRUNCATE TABLE ${identifiers} CASCADE`);
      if (tables.includes('industry')) {
        // Baseline packs from migrations 003 and 007, never prior test rows.
        await tx.query(`INSERT INTO industry (slug, name, description) VALUES
          ('reinsurance-treaty', 'Reinsurance Treaty', 'Reinsurance treaty vocabulary and demo pack.'),
          ('general', 'General', 'No industry vocabulary. Terms you define yourself.')`);
        await tx.query(await readFile(new URL('../migrations/021_reinsurance_filing_vocabulary.up.sql', import.meta.url), 'utf8'));
        await tx.query(await readFile(new URL('../migrations/024_reinsurance_demo_pack.up.sql', import.meta.url), 'utf8'));
      }
    });
  }, tables.includes('industry') ? 30_000 : undefined);
}
