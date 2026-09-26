DROP FUNCTION public.resolve_pool_key(bytea);
CREATE FUNCTION public.resolve_pool_key(digest bytea)
RETURNS TABLE(pool_id uuid,project_id uuid,name text,mode_query boolean,mode_prompt boolean,clarification_policy text,key_prefix text,state text,grace_until timestamptz,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT p.id,p.project_id,p.name,p.mode_query,p.mode_prompt,p.clarification_policy,k.key_prefix,k.state,k.grace_until,k.created_at
 FROM public.pool_key k JOIN public.pool p ON p.id=k.pool_id AND p.project_id=k.project_id
 JOIN public.project project ON project.id=p.project_id
 WHERE k.key_hash=digest AND octet_length(digest)=32 AND project.archived_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.resolve_pool_key(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_pool_key(bytea) TO opintel_platform;
