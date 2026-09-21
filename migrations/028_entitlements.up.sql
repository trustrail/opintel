ALTER TABLE catalog_element ADD CONSTRAINT catalog_element_project_identity UNIQUE (id, project_id);
CREATE TABLE entitlement (
 pool_id uuid NOT NULL,
 element_id uuid NOT NULL,
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 treatment text NOT NULL CHECK (treatment IN ('clear','tokenized','masked','aggregate_only','withheld')),
 source_kind text NOT NULL CHECK (source_kind IN ('user','rule')),
 source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
 justification text,
 set_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (pool_id, element_id),
 FOREIGN KEY (pool_id, project_id) REFERENCES pool(id, project_id) ON DELETE CASCADE,
 FOREIGN KEY (element_id, project_id) REFERENCES catalog_element(id, project_id) ON DELETE CASCADE
);
CREATE INDEX entitlement_project_treatment ON entitlement(project_id, treatment);
CREATE INDEX entitlement_element ON entitlement(element_id);
ALTER TABLE entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON entitlement FOR SELECT USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
CREATE POLICY tenant_write ON entitlement FOR ALL USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid) WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON entitlement TO opintel_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON entitlement TO opintel_platform_admin;
