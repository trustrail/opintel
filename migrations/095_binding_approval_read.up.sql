-- Read only the current tenant's approval flag, while locking the project row
-- against a concurrent settings change. Never expose the full settings object.
CREATE FUNCTION identity_binding_requires_approval() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid:=NULLIF(current_setting('app.project_id',true),'')::uuid;
 uid uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid;
 value jsonb;
BEGIN
 IF pid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Tenant context required'; END IF;
 SELECT settings INTO value FROM public.project WHERE id=pid FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF jsonb_typeof(value->'approveIdentityBindings')='boolean' THEN RETURN (value->>'approveIdentityBindings')::boolean; END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION identity_binding_requires_approval() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity_binding_requires_approval() TO opintel_app;
