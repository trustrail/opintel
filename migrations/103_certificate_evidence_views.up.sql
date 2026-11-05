-- Preserve the request-time snapshot through the existing retention and export path.
ALTER TABLE evidence_rollup ADD COLUMN agent_identity jsonb;
CREATE FUNCTION public.rollup_certificate_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 SELECT agent_identity INTO NEW.agent_identity FROM public.query_run WHERE id=NEW.id AND started_at=NEW.started_at;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rollup_certificate_snapshot() FROM PUBLIC;
CREATE TRIGGER rollup_certificate_snapshot BEFORE INSERT ON evidence_rollup FOR EACH ROW EXECUTE FUNCTION public.rollup_certificate_snapshot();
CREATE OR REPLACE VIEW evidence_run_read WITH(security_invoker=true) AS
 SELECT r.id,r.project_id,r.pool_id,r.agent_id,r.key_prefix,r.mode,r.request,r.versions,r.started_at,r.capture_percent,r.capture_selected, 'full'::text AS record_kind,NULL::timestamptz AS rolled_up_at,'{}'::jsonb AS treatment_counts,'{}'::jsonb AS source_treatment_counts,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('at',e.redacted_at,'policy',e.policy,'fields',e.fields) ORDER BY e.redacted_at,e.id) FROM evidence_redaction e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]'::jsonb) AS redactions,r.credential_id,r.custody_alias,r.agent_identity
 FROM query_run r
 UNION ALL
 SELECT id,project_id,pool_id,agent_id,key_prefix,mode,NULL::text,versions,started_at,capture_percent,capture_selected,'rollup',created_at,treatment_counts,source_treatment_counts,redactions,credential_id,custody_alias,agent_identity FROM evidence_rollup;
