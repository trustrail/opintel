-- Keep the published 052 bytes unchanged; provision the expiry lookup index forward.
CREATE INDEX evidence_rollup_retention ON evidence_rollup(project_id,created_at,id);
