CREATE TABLE pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND length(btrim(name)) > 0),
  mode_query boolean NOT NULL DEFAULT true,
  mode_prompt boolean NOT NULL DEFAULT true,
  clarification_policy text NOT NULL DEFAULT 'pause' CHECK (clarification_policy IN ('pause','refuse')),
  budgets jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(budgets) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)
);
CREATE UNIQUE INDEX pool_project_name ON pool(project_id, lower(name));
CREATE TABLE pool_key (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  key_hash bytea NOT NULL UNIQUE CHECK (octet_length(key_hash) = 32),
  key_prefix text NOT NULL CHECK (key_prefix ~ '^opk_live_[A-Za-z0-9]{1,21}$'),
  state text NOT NULL CHECK (state IN ('current','retiring','revoked','expired')),
  grace_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES user_account(id),
  FOREIGN KEY (pool_id, project_id) REFERENCES pool(id, project_id) ON DELETE CASCADE,
  CHECK ((state IN ('retiring','expired') AND grace_until IS NOT NULL AND grace_until > created_at)
    OR (state IN ('current','revoked') AND grace_until IS NULL))
);
CREATE UNIQUE INDEX one_current_key_per_pool ON pool_key(pool_id) WHERE state = 'current';
CREATE UNIQUE INDEX one_retiring_key_per_pool ON pool_key(pool_id) WHERE state = 'retiring';
CREATE INDEX pool_key_project ON pool_key(project_id);
CREATE TABLE pool_source_binding (
  pool_id uuid NOT NULL,
  source_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  bound_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, source_id),
  FOREIGN KEY (pool_id, project_id) REFERENCES pool(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (source_id, project_id) REFERENCES data_source(id, project_id) ON DELETE CASCADE
);
CREATE INDEX pool_source_binding_project ON pool_source_binding(project_id);
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['pool','pool_key','pool_source_binding'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid)', table_name);
    EXECUTE format('CREATE POLICY tenant_write ON %I FOR ALL USING (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid) WITH CHECK (project_id = NULLIF(current_setting(''app.project_id'', true), '''')::uuid)', table_name);
  END LOOP;
END
$$;
GRANT SELECT, INSERT, UPDATE, DELETE ON pool, pool_key, pool_source_binding TO opintel_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON pool, pool_key, pool_source_binding TO opintel_platform_admin;
