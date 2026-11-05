DO $$ BEGIN IF EXISTS(SELECT 1 FROM evidence_rollup WHERE agent_identity IS NOT NULL) THEN RAISE EXCEPTION 'Cannot remove recorded certificate evidence'; END IF; END $$;
DROP VIEW evidence_run_read;
DROP TRIGGER rollup_certificate_snapshot ON evidence_rollup;
DROP FUNCTION public.rollup_certificate_snapshot();
ALTER TABLE evidence_rollup DROP COLUMN agent_identity;
CREATE VIEW evidence_run_read WITH(security_invoker=true) AS
 SELECT r.id,r.project_id,r.pool_id,r.agent_id,r.key_prefix,r.mode,r.request,r.versions,r.started_at,r.capture_percent,r.capture_selected, 'full'::text AS record_kind,NULL::timestamptz AS rolled_up_at,'{}'::jsonb AS treatment_counts,'{}'::jsonb AS source_treatment_counts,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('at',e.redacted_at,'policy',e.policy,'fields',e.fields) ORDER BY e.redacted_at,e.id) FROM evidence_redaction e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]'::jsonb) AS redactions,r.credential_id,r.custody_alias
 FROM query_run r
 UNION ALL
 SELECT id,project_id,pool_id,agent_id,key_prefix,mode,NULL::text,versions,started_at,capture_percent,capture_selected,'rollup',created_at,treatment_counts,source_treatment_counts,redactions,credential_id,custody_alias FROM evidence_rollup;

GRANT SELECT ON evidence_run_read TO opintel_app;
