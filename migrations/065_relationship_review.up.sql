-- Reviews are immutable facts. Candidate attempts and domain assignments remain intact.
CREATE TABLE token_join_review(
 id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES project(id),
 left_element_id uuid NOT NULL REFERENCES catalog_element(id),right_element_id uuid NOT NULL REFERENCES catalog_element(id),
 action text NOT NULL CHECK(action IN ('confirm','reject','not_sure')),
 actor_id uuid NOT NULL REFERENCES user_account(id),reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 latest_attempt_id uuid NOT NULL REFERENCES token_join_candidate(id),
 domain text,assignments jsonb NOT NULL DEFAULT '[]',
 CHECK(left_element_id<right_element_id),CHECK((action='confirm')=(domain IS NOT NULL))
);
CREATE INDEX token_join_review_pair ON token_join_review(project_id,left_element_id,right_element_id,reviewed_at DESC,id DESC);
ALTER TABLE token_join_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_join_review FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON token_join_review FOR SELECT TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON token_join_review FOR INSERT TO opintel_app WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid
 AND actor_id=NULLIF(current_setting('app.user_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM catalog_element e WHERE e.id=left_element_id AND e.project_id=token_join_review.project_id)
 AND EXISTS(SELECT 1 FROM catalog_element e WHERE e.id=right_element_id AND e.project_id=token_join_review.project_id)
 AND EXISTS(SELECT 1 FROM token_join_candidate c WHERE c.id=latest_attempt_id AND LEAST(c.left_element_id,c.right_element_id)=token_join_review.left_element_id AND GREATEST(c.left_element_id,c.right_element_id)=token_join_review.right_element_id));
GRANT SELECT,INSERT ON token_join_review TO opintel_app;
GRANT TRUNCATE ON token_join_review TO opintel_platform_admin;
