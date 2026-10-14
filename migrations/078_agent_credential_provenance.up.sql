-- Read only the credential-admission boundary; the ledger remains owner-only.
CREATE FUNCTION public.is_credential_authentication(authenticated_at timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE credential_cutoff timestamptz;
BEGIN
 SELECT applied_at INTO STRICT credential_cutoff FROM public.schema_migration WHERE version='072';
 RETURN authenticated_at >= credential_cutoff;
END $$;
REVOKE ALL ON FUNCTION public.is_credential_authentication(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_credential_authentication(timestamptz) TO opintel_app;
