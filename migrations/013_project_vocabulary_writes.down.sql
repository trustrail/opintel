-- synonym_candidate already had these grants before this migration.
REVOKE INSERT, UPDATE, DELETE ON vocabulary_term, term_synonym FROM opintel_app;
DROP POLICY tenant_write ON term_synonym;
DROP POLICY tenant_read ON term_synonym;
ALTER TABLE term_synonym NO FORCE ROW LEVEL SECURITY;
ALTER TABLE term_synonym DISABLE ROW LEVEL SECURITY;
