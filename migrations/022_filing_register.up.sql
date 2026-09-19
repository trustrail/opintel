-- Application projections only. Customer-local history remains the arrival authority.
CREATE TABLE arrival_notice (
 filing_id uuid PRIMARY KEY, project_id uuid NOT NULL, source_id uuid NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0), payload jsonb NOT NULL,
 FOREIGN KEY (source_id, project_id) REFERENCES data_source(id, project_id) ON DELETE CASCADE
);
CREATE INDEX arrival_notice_project_page ON arrival_notice(project_id, filing_id);
CREATE TABLE reconciliation_report (
 source_id uuid PRIMARY KEY, project_id uuid NOT NULL, checked_at timestamptz NOT NULL, payload jsonb NOT NULL,
 FOREIGN KEY (source_id, project_id) REFERENCES data_source(id, project_id) ON DELETE CASCADE
);
ALTER TABLE arrival_notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_notice FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON arrival_notice FOR SELECT USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
CREATE POLICY tenant_write ON arrival_notice FOR ALL USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid) WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON arrival_notice TO opintel_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON arrival_notice TO opintel_platform_admin;
ALTER TABLE reconciliation_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_report FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON reconciliation_report FOR SELECT USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
CREATE POLICY tenant_write ON reconciliation_report FOR ALL USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid) WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON reconciliation_report TO opintel_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON reconciliation_report TO opintel_platform_admin;
