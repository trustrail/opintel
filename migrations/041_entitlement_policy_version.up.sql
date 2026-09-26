-- A database-owned transaction marker, not a caller-settable session setting.
-- xid8 includes the transaction epoch, so an old marker cannot alias after wrap.
ALTER TABLE public.project ADD COLUMN policy_version_txid xid8;

CREATE FUNCTION public.bump_entitlement_policy_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  changed_projects uuid[];
  changed_project uuid;
  writing_transaction xid8 := pg_current_xact_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT project_id ORDER BY project_id) INTO changed_projects FROM new_entitlement_rows;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT project_id ORDER BY project_id) INTO changed_projects FROM old_entitlement_rows;
  ELSE
    SELECT array_agg(project_id ORDER BY project_id) INTO changed_projects
      FROM (SELECT project_id FROM old_entitlement_rows UNION SELECT project_id FROM new_entitlement_rows) affected;
  END IF;
  FOREACH changed_project IN ARRAY COALESCE(changed_projects, ARRAY[]::uuid[]) LOOP
    -- The project row serializes competing writers. The predicate is rechecked
    -- after waiting, so concurrent transactions each advance the version once.
    UPDATE public.project
      SET policy_version = policy_version + 1, policy_version_txid = writing_transaction
      WHERE id = changed_project AND policy_version_txid IS DISTINCT FROM writing_transaction;
  END LOOP;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.bump_entitlement_policy_version() FROM PUBLIC;

CREATE TRIGGER entitlement_policy_insert AFTER INSERT ON public.entitlement
  REFERENCING NEW TABLE AS new_entitlement_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_entitlement_policy_version();
CREATE TRIGGER entitlement_policy_update AFTER UPDATE ON public.entitlement
  REFERENCING OLD TABLE AS old_entitlement_rows NEW TABLE AS new_entitlement_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_entitlement_policy_version();
CREATE TRIGGER entitlement_policy_delete AFTER DELETE ON public.entitlement
  REFERENCING OLD TABLE AS old_entitlement_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_entitlement_policy_version();
