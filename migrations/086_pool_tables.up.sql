ALTER TABLE pool ADD COLUMN tables_explicit boolean NOT NULL DEFAULT false;
ALTER TABLE pool ADD COLUMN table_setup jsonb;
ALTER TABLE catalog_object ADD CONSTRAINT catalog_object_project_identity UNIQUE(id,project_id);
CREATE TABLE pool_table_binding (
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 pool_id uuid NOT NULL,
 object_id uuid NOT NULL,
 row_rule_reason text CHECK(row_rule_reason IN ('column_missing','incompatible_type','rule_required')),
 PRIMARY KEY(pool_id,object_id),
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id) ON DELETE CASCADE,
 FOREIGN KEY(object_id,project_id) REFERENCES catalog_object(id,project_id)
);
ALTER TABLE pool_table_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_table_binding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON pool_table_binding TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid)
 WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON pool_table_binding TO opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON pool_table_binding TO opintel_platform_admin;
CREATE FUNCTION public.pool_table_allowed(selected_pool uuid,selected_object uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT COALESCE((SELECT NOT p.tables_explicit OR EXISTS(SELECT 1 FROM public.pool_table_binding b WHERE b.pool_id=p.id AND b.object_id=selected_object) FROM public.pool p WHERE p.id=selected_pool),false)
$$;
REVOKE ALL ON FUNCTION public.pool_table_allowed(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pool_table_allowed(uuid,uuid) TO opintel_app,opintel_platform_admin;
CREATE TRIGGER pool_table_insert_policy AFTER INSERT ON pool_table_binding REFERENCING NEW TABLE AS new_entitlement_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_entitlement_policy_version();
CREATE TRIGGER pool_table_delete_policy AFTER DELETE ON pool_table_binding REFERENCING OLD TABLE AS old_entitlement_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_entitlement_policy_version();
