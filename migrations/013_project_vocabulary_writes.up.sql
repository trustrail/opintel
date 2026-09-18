-- Synonyms inherit their parent term's scope. Protect them before granting writes.
ALTER TABLE term_synonym ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_synonym FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON term_synonym FOR SELECT
  USING (EXISTS (SELECT 1 FROM vocabulary_term t WHERE t.id = term_id));
CREATE POLICY tenant_write ON term_synonym FOR ALL
  USING (EXISTS (
    SELECT 1 FROM vocabulary_term t WHERE t.id = term_id AND (
      t.project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
      OR (t.project_id IS NULL AND current_user = 'opintel_platform_admin')
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM vocabulary_term t WHERE t.id = term_id AND (
      t.project_id = NULLIF(current_setting('app.project_id', true), '')::uuid
      OR (t.project_id IS NULL AND current_user = 'opintel_platform_admin')
    )
  ));

GRANT INSERT, UPDATE, DELETE ON vocabulary_term, term_synonym, synonym_candidate TO opintel_app;
