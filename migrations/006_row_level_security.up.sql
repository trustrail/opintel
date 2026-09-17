DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opintel_app') THEN
    CREATE ROLE opintel_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opintel_platform') THEN
    CREATE ROLE opintel_platform NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opintel_platform_admin') THEN
    CREATE ROLE opintel_platform_admin NOLOGIN;
  END IF;
END
$$;

ALTER ROLE opintel_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE opintel_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE opintel_platform_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT opintel_app, opintel_platform, opintel_platform_admin TO opintel;

GRANT USAGE ON SCHEMA public TO opintel_app, opintel_platform, opintel_platform_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON synonym_candidate TO opintel_app;
GRANT SELECT ON industry, vocabulary_term, embedding TO opintel_app, opintel_platform;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON industry, company, project, vocabulary_term, embedding,
  synonym_candidate, user_account, user_identity, pending_invite, magic_link_token, company_idp,
  mail_outbox TO opintel_platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON company, project, user_account, user_identity,
  pending_invite, magic_link_token, company_idp, mail_outbox TO opintel_platform;

ALTER TABLE synonym_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE synonym_candidate FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON synonym_candidate FOR SELECT
  USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
CREATE POLICY tenant_write ON synonym_candidate FOR ALL
  USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid)
  WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);

ALTER TABLE vocabulary_term ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_term FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON vocabulary_term FOR SELECT
  USING (
    project_id IS NULL
    OR project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
  );
CREATE POLICY tenant_write ON vocabulary_term FOR ALL
  USING (
    project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
    OR (project_id IS NULL AND current_user = 'opintel_platform_admin')
  )
  WITH CHECK (
    project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
    OR (project_id IS NULL AND current_user = 'opintel_platform_admin')
  );

ALTER TABLE embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON embedding FOR SELECT
  USING (
    project_id IS NULL
    OR project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
  );
CREATE POLICY tenant_write ON embedding FOR ALL
  USING (
    project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
    OR (project_id IS NULL AND current_user = 'opintel_platform_admin')
  )
  WITH CHECK (
    project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
    OR (project_id IS NULL AND current_user = 'opintel_platform_admin')
  );
