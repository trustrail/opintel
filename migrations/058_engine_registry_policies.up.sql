-- Follow-up to 057: retain the project's RLS boundary for receipt service reads,
-- and conform to the named-policy discovery contract. No fleet-wide tenant read.
ALTER POLICY engine_tenant ON engine RENAME TO tenant_write;
CREATE POLICY tenant_read ON engine FOR SELECT TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
REVOKE ALL ON engine FROM opintel_platform;
