-- Read-only worker boundary, like the existing key-resolution/cleanup functions.
-- Known authenticated key ids only; never return hashes, prefixes, aliases,
-- grants or source/customer data. Tenant roles cannot call this function and
-- the platform role receives no direct pool/key/credential table privileges.
CREATE FUNCTION public.read_mcp_session_states(selected_keys uuid[])
RETURNS TABLE(key_version uuid,pool_id uuid,project_id uuid,credential_id uuid,
 mode_query boolean,mode_prompt boolean,settings jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT k.id,p.id,p.project_id,c.id,p.mode_query,p.mode_prompt,
  CASE WHEN jsonb_typeof(project.settings)='object' THEN
   (SELECT COALESCE(jsonb_object_agg(v.key,v.value),'{}'::jsonb)
    FROM jsonb_each(project.settings) v
    WHERE v.key IN ('agentHeartbeatSeconds','agentDisconnectGraceSeconds'))
   ELSE project.settings END
 FROM public.pool_key k
 JOIN public.pool p ON p.id=k.pool_id AND p.project_id=k.project_id
 JOIN public.project project ON project.id=p.project_id
 JOIN public.pool_credential c ON c.id=k.credential_id AND c.pool_id=p.id AND c.project_id=p.project_id
 WHERE k.id=ANY(selected_keys) AND project.archived_at IS NULL
  AND c.revoked_at IS NULL AND k.created_at<=statement_timestamp()
  AND (k.state='current' OR k.state='retiring' AND k.grace_until>statement_timestamp())
$$;
REVOKE ALL ON FUNCTION public.read_mcp_session_states(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_mcp_session_states(uuid[]) TO opintel_platform;
