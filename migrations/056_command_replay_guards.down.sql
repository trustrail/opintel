DROP TABLE company_creation_request;
CREATE OR REPLACE FUNCTION rename_project_setting(value text) RETURNS SETOF project
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid:=NULLIF(current_setting('app.project_id',true),'')::uuid;
 uid uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid; old_name text;
BEGIN
 IF pid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Tenant context required'; END IF;
 SELECT name INTO old_name FROM public.project WHERE id=pid FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.project SET name=value WHERE id=pid;
 INSERT INTO public.audit_entry(project_id,actor_id,actor_kind,action,target,before,after)
 VALUES(pid,uid,'user','ProjectRenamed',jsonb_build_object('projectId',pid),jsonb_build_object('name',old_name),jsonb_build_object('name',value));
 RETURN QUERY SELECT * FROM public.project WHERE id=pid;
END $$;
REVOKE ALL ON FUNCTION rename_project_setting(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rename_project_setting(text) TO opintel_app;
