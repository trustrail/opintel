-- The legacy schema cannot represent explain attempts. Never discard their provenance.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM token_join_candidate WHERE operation='explain') THEN
  RAISE EXCEPTION 'Cannot downgrade while explain join candidates exist: the legacy schema cannot preserve their provenance';
 END IF;
END $$;
DROP POLICY tenant_write ON token_join_candidate;
DROP INDEX token_join_candidate_run;
ALTER TABLE token_join_candidate DROP CONSTRAINT candidate_operation_run;
ALTER TABLE token_join_candidate DROP COLUMN operation;
ALTER TABLE token_join_candidate DROP COLUMN run_id;
ALTER TABLE token_join_candidate RENAME COLUMN id TO run_id;
CREATE POLICY tenant_write ON token_join_candidate FOR INSERT TO opintel_app
 WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM query_run r WHERE r.id=run_id AND r.project_id=token_join_candidate.project_id AND r.pool_id=token_join_candidate.pool_id AND r.started_at=attempted_at));
