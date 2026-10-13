DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM evidence_rollup WHERE row_preview IS NOT NULL) THEN
  RAISE EXCEPTION 'Downgrade would destroy privileged preview evidence';
 END IF;
END $$;
CREATE OR REPLACE VIEW evidence_completion_read WITH(security_invoker=true) AS
 SELECT run_id,started_at,outcome,cil,source_plan,generated_sql,latency_ms,freshness,synthetic,completed_at,token_key_version_used,detail_captured FROM run_completion
 UNION ALL
 SELECT id,started_at,outcome,NULL::jsonb,CASE WHEN row_scopes IS NULL THEN NULL::jsonb ELSE jsonb_build_object('rowScopes',row_scopes) END,NULL::text,latency_ms,'{}'::jsonb,synthetic,completed_at,token_key_version_used,detail_captured FROM evidence_rollup;
DROP TRIGGER evidence_rollup_row_preview ON evidence_rollup;
DROP FUNCTION public.retain_row_preview_receipt();
ALTER TABLE evidence_rollup DROP COLUMN row_preview;
