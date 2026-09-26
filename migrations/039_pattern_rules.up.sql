CREATE TABLE pattern_rule (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 matcher text NOT NULL CHECK (length(matcher)>0),
 match_kind text NOT NULL CHECK (match_kind IN ('name_glob','type','schema')),
 treatment text NOT NULL CHECK (treatment IN ('clear','tokenized','masked','aggregate_only','withheld')),
 priority integer NOT NULL DEFAULT 100,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 mask_kind text CHECK (mask_kind IN ('last4','email','year','all')),
 CONSTRAINT rule_mask_kind_when_masked CHECK ((treatment='masked')=(mask_kind IS NOT NULL))
);
CREATE INDEX pattern_rule_project ON pattern_rule(project_id);

-- Identifier-only IntrospectionCompleted outbox, committed with the diff.
ALTER TABLE introspection_run ADD CONSTRAINT introspection_run_project_identity UNIQUE(id,project_id);
CREATE TABLE introspection_completed (
 run_id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 source_id uuid NOT NULL,
 user_id uuid NOT NULL,
 delivered_at timestamptz,
 UNIQUE(run_id,project_id),
 FOREIGN KEY(run_id,project_id) REFERENCES introspection_run(id,project_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,project_id) REFERENCES data_source(id,project_id) ON DELETE CASCADE
);
-- Targets are fixed at diff publication. A later pool binding is not discovery.
-- Each target is an idempotent handler receipt and, on refusal, an observation.
CREATE TABLE pattern_rule_application (
 run_id uuid NOT NULL,
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 pool_id uuid NOT NULL,
 element_id uuid NOT NULL,
 processed_at timestamptz,
 rule_ids uuid[] NOT NULL DEFAULT '{}',
 element_name text,
 message text,
 PRIMARY KEY(run_id,pool_id,element_id),
 FOREIGN KEY(run_id,project_id) REFERENCES introspection_completed(run_id,project_id) ON DELETE CASCADE,
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id) ON DELETE CASCADE,
 FOREIGN KEY(element_id,project_id) REFERENCES catalog_element(id,project_id) ON DELETE CASCADE
);
CREATE INDEX introspection_completed_pending ON introspection_completed(project_id) WHERE delivered_at IS NULL;
CREATE INDEX pattern_rule_application_pending ON pattern_rule_application(project_id,run_id) WHERE processed_at IS NULL;

ALTER TABLE pattern_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON pattern_rule FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON pattern_rule FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
ALTER TABLE introspection_completed ENABLE ROW LEVEL SECURITY;
ALTER TABLE introspection_completed FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON introspection_completed FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON introspection_completed FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
ALTER TABLE pattern_rule_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_rule_application FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON pattern_rule_application FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON pattern_rule_application FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON pattern_rule,introspection_completed,pattern_rule_application TO opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON pattern_rule,introspection_completed,pattern_rule_application TO opintel_platform_admin;
