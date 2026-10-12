-- A downgrade cannot collapse independent identities or change permanent aliases.
DO $$ BEGIN
 IF EXISTS(SELECT pool_id FROM pool_credential GROUP BY pool_id HAVING count(*)>1) OR EXISTS(SELECT 1 FROM pool_credential WHERE revoked_at IS NOT NULL) OR EXISTS(SELECT 1 FROM pool_key WHERE custody_alias<>'agent:'||project_id::text||':'||id::text) OR EXISTS(SELECT 1 FROM query_run WHERE credential_id IS NOT NULL) OR EXISTS(SELECT 1 FROM evidence_rollup WHERE credential_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Credential identities or receipt history exist; downgrade refused';
 END IF;
END $$;
DROP VIEW evidence_run_read;
DROP TRIGGER rollup_credential_snapshot ON evidence_rollup;
DROP FUNCTION public.rollup_credential_snapshot();
ALTER TABLE evidence_rollup DROP COLUMN credential_id,DROP COLUMN custody_alias;
CREATE VIEW evidence_run_read WITH(security_invoker=true) AS
 SELECT r.id,r.project_id,r.pool_id,r.agent_id,r.key_prefix,r.mode,r.request,r.versions,r.started_at,r.capture_percent,r.capture_selected, 'full'::text AS record_kind,NULL::timestamptz AS rolled_up_at,'{}'::jsonb AS treatment_counts,'{}'::jsonb AS source_treatment_counts,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('at',e.redacted_at,'policy',e.policy,'fields',e.fields) ORDER BY e.redacted_at,e.id) FROM evidence_redaction e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]'::jsonb) AS redactions
 FROM query_run r
 UNION ALL
 SELECT id,project_id,pool_id,agent_id,key_prefix,mode,NULL::text,versions,started_at,capture_percent,capture_selected,'rollup',created_at,treatment_counts,source_treatment_counts,redactions FROM evidence_rollup;
GRANT SELECT ON evidence_run_read TO opintel_app;
DROP FUNCTION public.pending_credential_alias_cleanup();
DROP FUNCTION public.resolve_pool_credential(bytea);
ALTER TABLE query_run DROP COLUMN custody_alias;
ALTER TABLE query_run DROP COLUMN credential_id;
DROP INDEX one_current_key_per_credential;
DROP INDEX one_retiring_key_per_credential;
ALTER TABLE pool_key DROP COLUMN alias_retired_at;
ALTER TABLE pool_key DROP COLUMN credential_id;
CREATE UNIQUE INDEX one_current_key_per_pool ON pool_key(pool_id) WHERE state='current';
CREATE UNIQUE INDEX one_retiring_key_per_pool ON pool_key(pool_id) WHERE state='retiring';
CREATE OR REPLACE FUNCTION public.bind_custody_alias() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.custody_alias:='agent:'||NEW.project_id::text||':'||NEW.id::text;
 ELSIF NEW.custody_alias IS DISTINCT FROM OLD.custody_alias THEN RAISE EXCEPTION 'Credential custody alias is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TABLE pool_credential;
DROP FUNCTION public.bind_pool_credential();
