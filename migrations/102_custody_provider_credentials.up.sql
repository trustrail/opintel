-- Encrypted per-project overrides, deliberately outside public project settings.
ALTER TABLE project ADD COLUMN custody_credentials text, ADD COLUMN custody_credentials_changed_at timestamptz;
CREATE FUNCTION public.save_custody_credentials(encrypted text, checked jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE pid uuid:=NULLIF(current_setting('app.project_id',true),'')::uuid;
 uid uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid;
BEGIN
 IF pid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Tenant context required'; END IF;
 UPDATE public.project SET custody_credentials=encrypted,custody_credentials_changed_at=clock_timestamp(),custody_check=checked WHERE id=pid;
 INSERT INTO public.audit_entry(project_id,actor_id,actor_kind,action,target,after)
 VALUES(pid,uid,'user','CustodyCredentialsChanged',jsonb_build_object('projectId',pid),jsonb_build_object('credentialsSet',true));
END $$;
REVOKE ALL ON FUNCTION public.save_custody_credentials(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_custody_credentials(text,jsonb) TO opintel_app;
