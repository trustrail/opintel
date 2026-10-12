-- Immutable administrator decisions. The first decision also is the Activity
-- scoping-boundary event; it is not inferred later from mutable catalogue state.
CREATE TABLE row_entitlement (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 object_id uuid NOT NULL REFERENCES catalog_object(id),
 pool_id uuid NOT NULL,
 object_name text NOT NULL DEFAULT '',
 expression text NOT NULL CHECK(length(expression) BETWEEN 1 AND 8192),
 predicate jsonb NOT NULL,
 predicate_hash text NOT NULL CHECK(predicate_hash ~ '^[0-9a-f]{64}$'),
 columns jsonb NOT NULL CHECK(jsonb_typeof(columns)='array'),
 actor_id uuid NOT NULL REFERENCES user_account(id),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 first_scoping boolean NOT NULL DEFAULT false,
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id)
);
CREATE INDEX row_entitlement_current ON row_entitlement(project_id,object_id,pool_id,sequence DESC);
CREATE UNIQUE INDEX row_entitlement_first ON row_entitlement(object_id) WHERE first_scoping;
ALTER TABLE row_entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE row_entitlement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON row_entitlement FOR SELECT TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON row_entitlement FOR INSERT TO opintel_app WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT ON row_entitlement TO opintel_app;
GRANT USAGE ON SEQUENCE row_entitlement_sequence_seq TO opintel_app;
GRANT TRUNCATE ON row_entitlement TO opintel_platform_admin;
CREATE FUNCTION public.bind_row_entitlement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM id FROM public.catalog_object WHERE id=NEW.object_id AND project_id=NEW.project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Row decision object must belong to its project'; END IF;
 SELECT exposed_name INTO NEW.object_name FROM public.catalog_object WHERE id=NEW.object_id;
 NEW.actor_id:=NULLIF(current_setting('app.user_id',true),'')::uuid;
 NEW.first_scoping:=NOT EXISTS(SELECT 1 FROM public.row_entitlement WHERE object_id=NEW.object_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_row_entitlement() FROM PUBLIC;
CREATE TRIGGER row_entitlement_identity BEFORE INSERT ON row_entitlement FOR EACH ROW EXECUTE FUNCTION public.bind_row_entitlement();
CREATE TRIGGER row_entitlement_policy AFTER INSERT ON row_entitlement REFERENCING NEW TABLE AS new_entitlement_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_entitlement_policy_version();
-- Scope receipt facts survive evidence sampling and retention. The copy occurs
-- before the existing maintenance transaction removes the full completion.
ALTER TABLE evidence_rollup ADD COLUMN row_scopes jsonb;
CREATE FUNCTION public.retain_row_scope_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 SELECT source_plan->'rowScopes' INTO NEW.row_scopes FROM public.run_completion WHERE run_id=NEW.id AND started_at=NEW.started_at;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.retain_row_scope_receipt() FROM PUBLIC;
CREATE TRIGGER evidence_rollup_row_scope BEFORE INSERT ON evidence_rollup FOR EACH ROW EXECUTE FUNCTION public.retain_row_scope_receipt();
CREATE OR REPLACE VIEW evidence_completion_read WITH(security_invoker=true) AS
 SELECT run_id,started_at,outcome,cil,source_plan,generated_sql,latency_ms,freshness,synthetic,completed_at,token_key_version_used,detail_captured FROM run_completion
 UNION ALL
 SELECT id,started_at,outcome,NULL::jsonb,CASE WHEN row_scopes IS NULL THEN NULL::jsonb ELSE jsonb_build_object('rowScopes',row_scopes) END,NULL::text,latency_ms,'{}'::jsonb,synthetic,completed_at,token_key_version_used,detail_captured FROM evidence_rollup;
