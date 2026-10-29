-- Preserve migration 086's project predicate and opintel_app-only scope while
-- adopting the same explicit read/write policy contract as pool_source_binding.
DROP POLICY tenant_access ON pool_table_binding;
CREATE POLICY tenant_read ON pool_table_binding FOR SELECT TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON pool_table_binding FOR ALL TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid)
 WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
