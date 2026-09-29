-- Redaction and ageing are irreversible; downgrade never fabricates removed arguments or full records.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM evidence_rollup) OR EXISTS(SELECT 1 FROM evidence_redaction) OR EXISTS(SELECT 1 FROM query_run WHERE request IS NULL OR capture_percent<>100 OR NOT capture_selected) OR EXISTS(SELECT 1 FROM run_completion WHERE NOT detail_captured) THEN RAISE EXCEPTION 'Cannot downgrade evidence lifecycle while rollup, redaction or sampling facts remain; downgrade would destroy evidence'; END IF; END $$;
DROP FUNCTION retain_evidence(uuid);
DROP FUNCTION redact_evidence_arguments(uuid,uuid,timestamptz,text,text,text,text,jsonb);
DROP FUNCTION evidence_redaction_batch(uuid,timestamptz,uuid,integer);
DROP FUNCTION provision_evidence_partitions();
DROP VIEW evidence_completion_read,evidence_run_read;
DROP TABLE evidence_rollup,evidence_redaction;
ALTER TABLE query_run ALTER COLUMN request SET NOT NULL;
ALTER TABLE run_completion DROP CONSTRAINT evidence_failure_detail;
ALTER TABLE run_completion DROP COLUMN detail_captured;
ALTER TABLE query_run DROP COLUMN capture_selected,DROP COLUMN capture_percent;
