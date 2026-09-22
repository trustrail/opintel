-- Nullable declarations have no defaults; existing integer columns remain numbers.
ALTER TABLE catalog_element ADD COLUMN source_timezone text;
ALTER TABLE catalog_element ADD COLUMN epoch_unit text CHECK (epoch_unit IN ('seconds','milliseconds'));
CREATE TABLE catalog_schema_temporal (
  source_id uuid NOT NULL,
  project_id uuid NOT NULL,
  schema_name text NOT NULL,
  source_timezone text NOT NULL,
  PRIMARY KEY (source_id, schema_name),
  FOREIGN KEY (source_id, project_id) REFERENCES data_source(id, project_id) ON DELETE CASCADE
);
ALTER TABLE catalog_schema_temporal ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_schema_temporal FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON catalog_schema_temporal FOR SELECT USING (project_id = NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON catalog_schema_temporal FOR ALL USING (project_id = NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK (project_id = NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_schema_temporal TO opintel_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON catalog_schema_temporal TO opintel_platform_admin;
