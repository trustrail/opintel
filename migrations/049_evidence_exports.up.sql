CREATE TABLE evidence_export (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 format text NOT NULL CHECK(format IN ('ndjson','csv')),
 filters jsonb NOT NULL,
 signing_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE evidence_export_request (
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 request_key text NOT NULL,
 body_hash text NOT NULL,
 export_id uuid NOT NULL REFERENCES evidence_export(id),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',
 PRIMARY KEY(project_id,actor_id,request_key)
);
ALTER TABLE evidence_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_export FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON evidence_export FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY tenant_write ON evidence_export FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
ALTER TABLE evidence_export_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_export_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON evidence_export_request FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY tenant_write ON evidence_export_request FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT ON evidence_export TO opintel_app;
GRANT SELECT,INSERT,UPDATE ON evidence_export_request TO opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON evidence_export,evidence_export_request TO opintel_platform_admin;
