import { describe, expect, it } from 'vitest';
import { withPlatform } from '../src/platform/db/scope.js';

const databaseIntegration = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1'
  ? describe.skip
  : describe;

const roles = ['opintel_app', 'opintel_platform', 'opintel_platform_admin'] as const;
const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;
type Privilege = typeof privileges[number];
type GrantContract = Record<typeof roles[number], readonly Privilege[]>;

const manage = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const;
const sharedRead: GrantContract = {
  opintel_app: ['SELECT'], opintel_platform: ['SELECT'], opintel_platform_admin: manage,
};
const projectVocabulary: GrantContract = {
  ...sharedRead, opintel_app: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
};
const platformManaged: GrantContract = {
  opintel_app: [], opintel_platform: manage, opintel_platform_admin: manage,
};

// Explicit contracts, not an exclusion list: discovery below fails on every new
// public table until its owning scope and privileges have been reviewed.
const contracts: Record<string, GrantContract> = {
  ...Object.fromEntries(['data_source', 'introspection_run', 'catalog_object', 'catalog_element', 'element_stats', 'cedant', 'cedant_file_rule'].map((table) => [table, {
    opintel_app: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], opintel_platform: [], opintel_platform_admin: manage,
  } satisfies GrantContract])),
  industry: sharedRead,
  vocabulary_term: projectVocabulary,
  embedding: sharedRead,
  demo_source_template: sharedRead,
  // §4.5: synonyms must be accessed through their vocabulary_term parent.
  term_synonym: projectVocabulary,
  synonym_candidate: {
    opintel_app: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    opintel_platform: [], opintel_platform_admin: manage,
  },
  company: platformManaged,
  project: platformManaged,
  user_account: platformManaged,
  user_identity: platformManaged,
  pending_invite: platformManaged,
  magic_link_token: platformManaged,
  company_idp: platformManaged,
  mail_outbox: platformManaged,
  company_member: platformManaged,
  project_member: platformManaged,
  relationship_outbox: platformManaged,
  // Migration bookkeeping is owner-only, never accessed by an application scope.
  schema_migration: { opintel_app: [], opintel_platform: [], opintel_platform_admin: [] },
};

type GrantRow = {
  table_name: string;
  role_name: typeof roles[number];
  privilege: Privilege;
  granted: boolean;
};

databaseIntegration('application table grants', () => {
  it('requires the declared privileges for every public table and application role', async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required when REQUIRE_DB_TESTS=1.');
    const rows = await withPlatform((tx) => tx.query<GrantRow>(
      `SELECT c.relname AS table_name, r.role_name, p.privilege,
              has_table_privilege(r.role_name, c.oid, p.privilege) AS granted
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN unnest($1::text[]) r(role_name)
       CROSS JOIN unnest($2::text[]) p(privilege)
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       ORDER BY c.relname, r.role_name, p.privilege`,
      [roles, privileges],
    ));

    const tables = [...new Set(rows.map((row) => row.table_name))].sort();
    expect(tables, 'Every public table needs an explicit grant contract.').toEqual(Object.keys(contracts).sort());
    const mismatches = rows.flatMap((row) => {
      const contract = contracts[row.table_name];
      if (contract === undefined) return [`${row.table_name}: missing grant contract`];
      const required = contract[row.role_name].includes(row.privilege);
      return row.granted === required ? [] : [
        `${row.table_name}: ${row.role_name} ${row.privilege} ${required ? 'missing' : 'unexpected'}`,
      ];
    });
    expect(mismatches, 'Effective grants must match each scope, including inherited/PUBLIC grants.').toEqual([]);
  });
});
