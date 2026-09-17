DROP POLICY tenant_write ON embedding;
DROP POLICY tenant_read ON embedding;
ALTER TABLE embedding NO FORCE ROW LEVEL SECURITY;
ALTER TABLE embedding DISABLE ROW LEVEL SECURITY;

DROP POLICY tenant_write ON vocabulary_term;
DROP POLICY tenant_read ON vocabulary_term;
ALTER TABLE vocabulary_term NO FORCE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_term DISABLE ROW LEVEL SECURITY;

DROP POLICY tenant_write ON synonym_candidate;
DROP POLICY tenant_read ON synonym_candidate;
ALTER TABLE synonym_candidate NO FORCE ROW LEVEL SECURITY;
ALTER TABLE synonym_candidate DISABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON embedding, vocabulary_term, synonym_candidate, industry, company, project,
  user_account, user_identity, pending_invite, magic_link_token, company_idp, mail_outbox
  FROM opintel_app, opintel_platform, opintel_platform_admin;
REVOKE USAGE ON SCHEMA public FROM opintel_app, opintel_platform, opintel_platform_admin;
REVOKE opintel_app, opintel_platform, opintel_platform_admin FROM opintel;

-- Roles are cluster-wide. Do not drop a role that may be granted in another
-- database; the next up migration restores this database's grants.
