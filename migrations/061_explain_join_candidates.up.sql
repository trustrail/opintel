-- A dry-run attempt has an identity without manufacturing a query run.
ALTER TABLE token_join_candidate RENAME COLUMN run_id TO id;
ALTER TABLE token_join_candidate ADD COLUMN run_id uuid;
UPDATE token_join_candidate SET run_id=id;
ALTER TABLE token_join_candidate ADD COLUMN operation text NOT NULL DEFAULT 'query'
 CHECK(operation IN ('query','explain'));
ALTER TABLE token_join_candidate ADD CONSTRAINT candidate_operation_run
 CHECK((operation='query' AND run_id IS NOT NULL) OR (operation='explain' AND run_id IS NULL));
CREATE UNIQUE INDEX token_join_candidate_run ON token_join_candidate(run_id) WHERE run_id IS NOT NULL;
DROP POLICY tenant_write ON token_join_candidate;
CREATE POLICY tenant_write ON token_join_candidate FOR INSERT TO opintel_app
 WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM catalog_element e WHERE e.id=left_element_id AND e.project_id=token_join_candidate.project_id)
 AND EXISTS(SELECT 1 FROM catalog_element e WHERE e.id=right_element_id AND e.project_id=token_join_candidate.project_id)
 AND (operation='explain' OR EXISTS(SELECT 1 FROM query_run r WHERE r.id=run_id AND r.project_id=token_join_candidate.project_id AND r.pool_id=token_join_candidate.pool_id AND r.started_at=attempted_at)));
