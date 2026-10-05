-- Refused attempts are facts for future administrator relationship review.
-- Statements can contain literals: this tenant store is not telemetry, an
-- evidence export, or an agent-readable interface.
CREATE TABLE token_join_candidate (
 run_id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES project(id),
 pool_id uuid NOT NULL,
 left_element_id uuid NOT NULL REFERENCES catalog_element(id),
 right_element_id uuid NOT NULL REFERENCES catalog_element(id),
 left_name text NOT NULL, right_name text NOT NULL,
 agent_id text NOT NULL, statement text NOT NULL,
 attempted_at timestamptz NOT NULL,
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id)
);
CREATE INDEX token_join_candidate_project_time ON token_join_candidate(project_id,attempted_at DESC,run_id);
ALTER TABLE token_join_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_join_candidate FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON token_join_candidate FOR SELECT TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON token_join_candidate FOR INSERT TO opintel_app
 WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM query_run r WHERE r.id=run_id AND r.project_id=token_join_candidate.project_id AND r.pool_id=token_join_candidate.pool_id AND r.started_at=attempted_at));
GRANT SELECT,INSERT ON token_join_candidate TO opintel_app;
GRANT ALL ON token_join_candidate TO opintel_platform_admin;
