-- Forward-only correction of the policies originally applied by 049. Grants stay unchanged.
DROP POLICY tenant_write ON evidence_export;
CREATE POLICY tenant_write ON evidence_export FOR INSERT WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
DROP POLICY tenant_write ON evidence_export_request;
CREATE POLICY tenant_write ON evidence_export_request FOR INSERT WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY tenant_update ON evidence_export_request FOR UPDATE USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
