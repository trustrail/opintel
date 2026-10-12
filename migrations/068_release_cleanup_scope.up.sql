-- Cleanup must survive project archival and the removal of its last member.
-- Expose only the identifiers needed to enter the existing tenant scope, never
-- shares, grants, aliases or signing material. The original scope actor is
-- retained by release_grant's foreign key.
CREATE FUNCTION public.pending_release_cleanup(selected_project uuid)
RETURNS TABLE(project_id uuid,scope_user_id uuid,id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT g.project_id,g.scope_user_id,g.id FROM public.release_grant g
 WHERE (selected_project IS NULL OR g.project_id=selected_project)
 AND (NOT g.escrow_revoked OR g.state='granted')
$$;
REVOKE ALL ON FUNCTION public.pending_release_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_release_cleanup(uuid) TO opintel_platform;
