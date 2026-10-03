CREATE OR REPLACE FUNCTION rename_project_setting(value text) RETURNS SETOF project
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid:=NULLIF(current_setting('app.project_id',true),'')::uuid;
 uid uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid; old_name text;
BEGIN
 IF pid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Tenant context required'; END IF;
 SELECT name INTO old_name FROM public.project WHERE id=pid FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF old_name IS NOT DISTINCT FROM value THEN
  RETURN QUERY SELECT * FROM public.project WHERE id=pid;
  RETURN;
 END IF;
 UPDATE public.project SET name=value WHERE id=pid;
 INSERT INTO public.audit_entry(project_id,actor_id,actor_kind,action,target,before,after)
 VALUES(pid,uid,'user','ProjectRenamed',jsonb_build_object('projectId',pid),jsonb_build_object('name',old_name),jsonb_build_object('name',value));
 RETURN QUERY SELECT * FROM public.project WHERE id=pid;
END $$;
REVOKE ALL ON FUNCTION rename_project_setting(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rename_project_setting(text) TO opintel_app;

-- Company creation has no tenant yet. Actor-scoped receipts are accessed only
-- by the authenticated platform application path, never the tenant role.
CREATE TABLE company_creation_request (
 actor_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
 route text NOT NULL CHECK (route = '/api/v1/companies'),
 request_key text NOT NULL,
 body_hash text NOT NULL,
 response jsonb NOT NULL,
 company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
 outbox_id bigint NOT NULL REFERENCES relationship_outbox(id),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,route,request_key)
);
REVOKE ALL ON company_creation_request FROM PUBLIC,opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON company_creation_request TO opintel_platform;
GRANT ALL ON company_creation_request TO opintel_platform_admin;
