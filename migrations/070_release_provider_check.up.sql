ALTER TABLE project ADD COLUMN custody_check jsonb;
-- Only trusted application code records a real adapter check. This is not a
-- client-writable setting; saving configuration cannot manufacture verification.
CREATE FUNCTION public.record_custody_check(value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE pid uuid:=NULLIF(current_setting('app.project_id',true),'')::uuid;
 uid uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid;
BEGIN
 IF pid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Tenant context required'; END IF;
 UPDATE public.project SET custody_check=value WHERE id=pid;
 INSERT INTO public.audit_entry(project_id,actor_id,actor_kind,action,target,after)
 VALUES(pid,uid,'user','CustodyProviderChecked',jsonb_build_object('projectId',pid),value);
END $$;
REVOKE ALL ON FUNCTION public.record_custody_check(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_custody_check(jsonb) TO opintel_app;
