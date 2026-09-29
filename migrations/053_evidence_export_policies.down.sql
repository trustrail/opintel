-- Restore 049 policy shape; never remove export descriptors or receipts.
DROP POLICY tenant_update ON evidence_export_request;
DROP POLICY tenant_write ON evidence_export;
CREATE POLICY tenant_write ON evidence_export FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
DROP POLICY tenant_write ON evidence_export_request;
CREATE POLICY tenant_write ON evidence_export_request FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
