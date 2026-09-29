-- §5.8 existing-project discovery mapping, verified against the pre-5.16 code:
-- newElements       rules_only : completion applies eligible pre-existing rules.
-- typeFamilyChange  revert     : publication invalidates old decisions.
-- renameHandling    carry      : stable-reference renames preserve identity.
-- adoptRenamedNames false      : default enqueue option; explicit run options survive.
-- valueSampling     false      : production introspection never samples values.
-- sampleSize        ABSENT     : caller supplied; no historical default exists.
-- Absent size + sampling=false is coherent, not incomplete. Require size on enable.
-- Only rows present during migration are backfilled. New projects choose explicitly.
UPDATE project SET settings=jsonb_set(settings,'{discovery}',
 '{"newElements":"rules_only","typeFamilyChange":"revert","renameHandling":"carry","adoptRenamedNames":false,"valueSampling":false}'::jsonb
 || COALESCE(settings->'discovery','{}'::jsonb));
ALTER TABLE user_account ADD COLUMN date_format text NOT NULL DEFAULT 'YYYY-MM-DD'
 CHECK(date_format IN ('YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY'));
ALTER TABLE user_account ADD COLUMN reduced_motion boolean NOT NULL DEFAULT false;
-- Lock the parent before any provider mutation, serialising provider changes and
-- company enforcement writes. Policies/grants alone cannot protect this invariant.
CREATE FUNCTION lock_company_idp_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.company_id<>OLD.company_id THEN
  RAISE EXCEPTION 'A provider cannot be moved between companies' USING ERRCODE='23514';
 END IF;
 PERFORM id FROM company WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER company_idp_settings_lock BEFORE INSERT OR UPDATE OR DELETE ON company_idp
 FOR EACH ROW EXECUTE FUNCTION lock_company_idp_settings();
CREATE FUNCTION check_company_sso_settings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE company_ref uuid;
BEGIN
 IF TG_TABLE_NAME='company' THEN company_ref=NEW.id;
 ELSIF TG_OP='DELETE' THEN company_ref=OLD.company_id;
 ELSE company_ref=NEW.company_id; END IF;
 IF EXISTS(SELECT 1 FROM company WHERE id=company_ref AND sso_enforced)
 AND (SELECT count(*) FROM company_idp WHERE company_id=company_ref AND enabled)<>1 THEN
  RAISE EXCEPTION 'Enforced SSO requires exactly one enabled company identity provider.' USING ERRCODE='23514',CONSTRAINT='company_sso_one_enabled_idp';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER company_sso_one_enabled_idp AFTER INSERT OR UPDATE ON company
 DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_company_sso_settings();
CREATE CONSTRAINT TRIGGER company_idp_sso_one_enabled AFTER INSERT OR UPDATE OR DELETE ON company_idp
 DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION check_company_sso_settings();
-- A narrow scoped command: the tenant role cannot update arbitrary project rows.
CREATE FUNCTION save_project_settings(value jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid:=NULLIF(current_setting('app.project_id',true),'')::uuid;
 uid uuid:=NULLIF(current_setting('app.user_id',true),'')::uuid;
 old_value jsonb; next_value jsonb; section text;
BEGIN
 IF pid IS NULL OR uid IS NULL THEN RAISE EXCEPTION 'Tenant context required'; END IF;
 SELECT settings INTO old_value FROM public.project WHERE id=pid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
 next_value:=old_value||value;
 FOREACH section IN ARRAY ARRAY['discovery','query','evidence'] LOOP
  IF value ? section THEN
   next_value:=jsonb_set(next_value,ARRAY[section],
    CASE section WHEN 'discovery' THEN COALESCE(old_value->section,'{}'::jsonb)-ARRAY['newElements','typeFamilyChange','renameHandling','adoptRenamedNames','valueSampling','sampleSize']
    WHEN 'query' THEN COALESCE(old_value->section,'{}'::jsonb)-ARRAY['timeoutSeconds','rowLimit','cardinalityConfirmThreshold','aggregateMinGroupSize','memoryLimitMb','concurrencyPerPool','maxStagingRows','maxQueuedExecutions']
    ELSE COALESCE(old_value->section,'{}'::jsonb)-ARRAY['fullRetentionDays','rollupRetentionDays','redaction','allowlistedFields','captureSamplingPercent'] END ||(value->section));
  END IF;
 END LOOP;
 UPDATE public.project SET settings=next_value WHERE id=pid;
 INSERT INTO public.audit_entry(project_id,actor_id,actor_kind,action,target,before,after)
 VALUES(pid,uid,'user','ProjectSettingsChanged',jsonb_build_object('projectId',pid),old_value,next_value);
 RETURN next_value;
END $$;
REVOKE ALL ON FUNCTION save_project_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_project_settings(jsonb) TO opintel_app;
