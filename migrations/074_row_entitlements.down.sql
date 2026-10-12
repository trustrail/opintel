DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM evidence_rollup WHERE row_scopes IS NOT NULL) OR EXISTS(SELECT 1 FROM row_entitlement) THEN RAISE EXCEPTION 'Cannot downgrade while row decision or scoping history exists'; END IF;
END $$;
DROP TABLE row_entitlement;
DROP FUNCTION public.bind_row_entitlement();
CREATE OR REPLACE VIEW evidence_completion_read WITH(security_invoker=true) AS
 SELECT run_id,started_at,outcome,cil,source_plan,generated_sql,latency_ms,freshness,synthetic,completed_at,token_key_version_used,detail_captured FROM run_completion
 UNION ALL
 SELECT id,started_at,outcome,NULL::jsonb,NULL::jsonb,NULL::text,latency_ms,'{}'::jsonb,synthetic,completed_at,token_key_version_used,detail_captured FROM evidence_rollup;
DROP TRIGGER evidence_rollup_row_scope ON evidence_rollup;
DROP FUNCTION public.retain_row_scope_receipt();
ALTER TABLE evidence_rollup DROP COLUMN row_scopes;
