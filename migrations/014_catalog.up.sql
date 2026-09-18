CREATE TABLE data_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('postgres', 'demo')),
  origin text NOT NULL DEFAULT 'customer' CHECK (origin IN ('customer', 'demo')),
  demo_template_id uuid REFERENCES demo_source_template(id) ON DELETE RESTRICT,
  name text NOT NULL,
  credential_ref text,
  sampling_consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  freshness_mode text NOT NULL DEFAULT 'live',
  last_introspected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id),
  CONSTRAINT credential_matches_origin CHECK (
    (origin = 'customer' AND credential_ref IS NOT NULL AND credential_ref LIKE 'vault://%') OR
    (origin = 'demo' AND credential_ref IS NULL AND demo_template_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX data_source_unique_name ON data_source (project_id, lower(name));

CREATE TABLE introspection_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'queued',
  progress jsonb NOT NULL DEFAULT '{}',
  error text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_id, project_id) REFERENCES data_source(id, project_id) ON DELETE CASCADE
);

CREATE TABLE catalog_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  schema_name text NOT NULL,
  object_name text NOT NULL,
  object_kind text NOT NULL CHECK (object_kind IN ('table', 'view', 'fileset')),
  duckdb_schema text NOT NULL,
  duckdb_name text NOT NULL,
  lineage_known boolean NOT NULL DEFAULT false,
  row_estimate bigint,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  UNIQUE (source_id, schema_name, object_name),
  UNIQUE (source_id, duckdb_schema, duckdb_name),
  UNIQUE (id, project_id),
  FOREIGN KEY (source_id, project_id) REFERENCES data_source(id, project_id) ON DELETE CASCADE
);

CREATE TABLE catalog_element (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  source_identifier text NOT NULL,
  duckdb_name text NOT NULL,
  stable_ref text,
  source_type text NOT NULL,
  duckdb_type text NOT NULL,
  nullable boolean NOT NULL DEFAULT true,
  is_key boolean NOT NULL DEFAULT false,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (object_id, duckdb_name),
  UNIQUE (object_id, source_identifier),
  FOREIGN KEY (object_id, project_id) REFERENCES catalog_object(id, project_id) ON DELETE CASCADE
);
CREATE INDEX catalog_element_project_status ON catalog_element (project_id, status);
CREATE INDEX catalog_element_object ON catalog_element (object_id) INCLUDE (duckdb_name, duckdb_type);
CREATE INDEX catalog_element_stable_ref ON catalog_element (object_id, stable_ref) WHERE stable_ref IS NOT NULL;

CREATE TABLE element_stats (
  element_id uuid PRIMARY KEY REFERENCES catalog_element(id) ON DELETE CASCADE,
  top_values jsonb NOT NULL DEFAULT '[]',
  cardinality bigint,
  null_rate numeric(5,4),
  sampled_at timestamptz
);

CREATE FUNCTION preserve_catalog_duckdb_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duckdb_name IS DISTINCT FROM OLD.duckdb_name THEN
    RAISE EXCEPTION 'An exposed catalogue name cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER catalog_object_immutable_name BEFORE UPDATE ON catalog_object
  FOR EACH ROW EXECUTE FUNCTION preserve_catalog_duckdb_name();
CREATE TRIGGER catalog_element_immutable_name BEFORE UPDATE ON catalog_element
  FOR EACH ROW EXECUTE FUNCTION preserve_catalog_duckdb_name();

CREATE FUNCTION preserve_catalog_duckdb_schema() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duckdb_schema IS DISTINCT FROM OLD.duckdb_schema THEN
    RAISE EXCEPTION 'An exposed catalogue schema cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER catalog_object_immutable_schema BEFORE UPDATE ON catalog_object
  FOR EACH ROW EXECUTE FUNCTION preserve_catalog_duckdb_schema();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['data_source', 'introspection_run', 'catalog_object', 'catalog_element'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid)', table_name);
    EXECUTE format('CREATE POLICY tenant_write ON %I FOR ALL USING (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid) WITH CHECK (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid)', table_name);
  END LOOP;
END
$$;
ALTER TABLE element_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE element_stats FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON element_stats FOR SELECT
  USING (EXISTS (SELECT 1 FROM catalog_element e WHERE e.id = element_id));
CREATE POLICY tenant_write ON element_stats FOR ALL
  USING (EXISTS (SELECT 1 FROM catalog_element e WHERE e.id = element_id))
  WITH CHECK (EXISTS (SELECT 1 FROM catalog_element e WHERE e.id = element_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON data_source, introspection_run, catalog_object, catalog_element, element_stats TO opintel_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON data_source, introspection_run, catalog_object, catalog_element, element_stats TO opintel_platform_admin;
