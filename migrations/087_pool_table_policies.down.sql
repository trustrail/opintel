DROP POLICY tenant_read ON pool_table_binding;
DROP POLICY tenant_write ON pool_table_binding;
CREATE POLICY tenant_access ON pool_table_binding TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid)
 WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
