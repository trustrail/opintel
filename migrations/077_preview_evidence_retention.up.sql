-- A privileged preview is evidence even after detailed query capture expires.
-- Retain only its actor, object, pool, predicate hash and time, never samples,
-- plaintext, ciphertext, table totals or the preview's temporary sealing key.
ALTER TABLE evidence_rollup ADD COLUMN row_preview jsonb;
CREATE FUNCTION public.retain_row_preview_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 SELECT source_plan->'rowPreview' INTO NEW.row_preview FROM public.run_completion WHERE run_id=NEW.id AND started_at=NEW.started_at;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.retain_row_preview_receipt() FROM PUBLIC;
CREATE TRIGGER evidence_rollup_row_preview BEFORE INSERT ON evidence_rollup FOR EACH ROW EXECUTE FUNCTION public.retain_row_preview_receipt();
CREATE OR REPLACE VIEW evidence_completion_read WITH(security_invoker=true) AS
 SELECT run_id,started_at,outcome,cil,source_plan,generated_sql,latency_ms,freshness,synthetic,completed_at,token_key_version_used,detail_captured FROM run_completion
 UNION ALL
 SELECT id,started_at,outcome,NULL::jsonb,
 CASE WHEN row_scopes IS NULL AND row_preview IS NULL THEN NULL::jsonb ELSE jsonb_strip_nulls(jsonb_build_object('rowScopes',row_scopes,'rowPreview',row_preview)) END,
 NULL::text,latency_ms,'{}'::jsonb,synthetic,completed_at,token_key_version_used,detail_captured FROM evidence_rollup;
