-- A database-owned transaction marker, not a caller-settable session setting.
-- xid8 includes the transaction epoch, so an old marker cannot alias after wrap.
ALTER TABLE public.project ADD COLUMN catalog_generation integer NOT NULL DEFAULT 1;
ALTER TABLE public.project ADD COLUMN catalog_generation_txid xid8;

CREATE FUNCTION public.bump_catalog_generation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  changed_projects uuid[];
  changed_project uuid;
  writing_transaction xid8 := pg_current_xact_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT project_id ORDER BY project_id) INTO changed_projects FROM new_catalog_rows;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT project_id ORDER BY project_id) INTO changed_projects FROM old_catalog_rows;
  ELSE
    SELECT array_agg(project_id ORDER BY project_id) INTO changed_projects
      FROM (SELECT project_id FROM old_catalog_rows UNION SELECT project_id FROM new_catalog_rows) affected;
  END IF;
  FOREACH changed_project IN ARRAY COALESCE(changed_projects, ARRAY[]::uuid[]) LOOP
    -- The project row serializes competing writers. The predicate is rechecked
    -- after waiting, so concurrent transactions each advance the version once.
    UPDATE public.project
      SET catalog_generation = catalog_generation + 1, catalog_generation_txid = writing_transaction
      WHERE id = changed_project AND catalog_generation_txid IS DISTINCT FROM writing_transaction;
  END LOOP;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION public.bump_catalog_generation() FROM PUBLIC;

CREATE TRIGGER catalog_object_generation_insert AFTER INSERT ON public.catalog_object
 REFERENCING NEW TABLE AS new_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_object_generation_update AFTER UPDATE ON public.catalog_object
 REFERENCING OLD TABLE AS old_catalog_rows NEW TABLE AS new_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_object_generation_delete AFTER DELETE ON public.catalog_object
 REFERENCING OLD TABLE AS old_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_element_generation_insert AFTER INSERT ON public.catalog_element
 REFERENCING NEW TABLE AS new_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_element_generation_update AFTER UPDATE ON public.catalog_element
 REFERENCING OLD TABLE AS old_catalog_rows NEW TABLE AS new_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_element_generation_delete AFTER DELETE ON public.catalog_element
 REFERENCING OLD TABLE AS old_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_schema_temporal_generation_insert AFTER INSERT ON public.catalog_schema_temporal
 REFERENCING NEW TABLE AS new_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_schema_temporal_generation_update AFTER UPDATE ON public.catalog_schema_temporal
 REFERENCING OLD TABLE AS old_catalog_rows NEW TABLE AS new_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();
CREATE TRIGGER catalog_schema_temporal_generation_delete AFTER DELETE ON public.catalog_schema_temporal
 REFERENCING OLD TABLE AS old_catalog_rows FOR EACH STATEMENT EXECUTE FUNCTION public.bump_catalog_generation();

-- Keep legacy stamps readable without rewriting append-only history.
ALTER TABLE query_run DROP CONSTRAINT query_run_versions_check;
ALTER TABLE query_run ADD CONSTRAINT query_run_versions_check CHECK (
 jsonb_typeof(versions)='object' AND versions ?& ARRAY['policy','vocabulary','catalog']
 AND jsonb_typeof(versions->'policy')='number' AND (versions->>'policy') ~ '^[0-9]+$'
 AND jsonb_typeof(versions->'vocabulary')='number' AND (versions->>'vocabulary') ~ '^[0-9]+$'
 AND jsonb_typeof(versions->'catalog')='number' AND (versions->>'catalog') ~ '^[0-9]+$'
 AND COALESCE((versions ? 'tokenKeyVersionSelected' AND
  (versions->'tokenKeyVersionSelected'='null'::jsonb OR
   (jsonb_typeof(versions->'tokenKeyVersionSelected')='number' AND (versions->>'tokenKeyVersionSelected') ~ '^[1-9][0-9]*$')))
 OR (NOT versions ? 'tokenKeyVersionSelected' AND jsonb_typeof(versions->'tokenKey')='number' AND (versions->>'tokenKey') ~ '^[0-9]+$'),false));
ALTER TABLE run_completion ADD COLUMN token_key_version_used integer CHECK(token_key_version_used>0);
CREATE FUNCTION public.check_evidence_token_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE selected integer;
BEGIN
 SELECT COALESCE(versions->>'tokenKeyVersionSelected',versions->>'tokenKey')::integer INTO selected
 FROM public.query_run WHERE id=NEW.run_id AND started_at=NEW.started_at;
 IF TG_TABLE_NAME LIKE 'run_element%' THEN
  IF NEW.treatment='tokenized' AND (selected IS NULL OR selected<=0) THEN
   RAISE EXCEPTION 'A tokenized element requires a selected token key version' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.token_key_version_used IS NOT NULL AND NEW.token_key_version_used IS DISTINCT FROM selected THEN
   RAISE EXCEPTION 'The used token key must equal the selected version' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_evidence_token_version() FROM PUBLIC;
CREATE TRIGGER evidence_element_token BEFORE INSERT ON run_element FOR EACH ROW EXECUTE FUNCTION public.check_evidence_token_version();
CREATE TRIGGER evidence_completion_token BEFORE INSERT ON run_completion FOR EACH ROW EXECUTE FUNCTION public.check_evidence_token_version();
