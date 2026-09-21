ALTER POLICY token_key_version_tenant ON token_key_version RENAME TO tenant_write;
CREATE POLICY tenant_read ON token_key_version FOR SELECT TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
ALTER POLICY token_key_operation_tenant ON token_key_operation RENAME TO tenant_write;
CREATE POLICY tenant_read ON token_key_operation FOR SELECT TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
