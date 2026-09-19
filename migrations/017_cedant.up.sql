CREATE TABLE cedant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text NOT NULL, name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)
);
CREATE UNIQUE INDEX cedant_project_code ON cedant (project_id, lower(code));
CREATE TABLE cedant_file_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cedant_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  match_kind text NOT NULL CHECK (match_kind IN ('filename_regex','folder')),
  pattern text NOT NULL,
  kind text CHECK (kind IN ('premium','claims','submission')),
  period_group text,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (cedant_id, project_id) REFERENCES cedant(id, project_id) ON DELETE CASCADE
);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cedant', 'cedant_file_rule'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid)', table_name);
    EXECUTE format('CREATE POLICY tenant_write ON %I FOR ALL USING (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid) WITH CHECK (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON cedant, cedant_file_rule TO opintel_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON cedant, cedant_file_rule TO opintel_platform_admin;
