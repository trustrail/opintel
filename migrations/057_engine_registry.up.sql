CREATE TABLE engine (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES project(id),
 name text NOT NULL, address text NOT NULL, certificate_pin text NOT NULL CHECK(certificate_pin ~ '^[0-9A-F]{64}$'),
 contract_version integer, verified_at timestamptz, last_seen_at timestamptz,
 health text NOT NULL DEFAULT 'unverified' CHECK(health IN ('unverified','healthy','unavailable','contract_mismatch')),
 health_message text, custody boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,id), UNIQUE(project_id,address)
);
CREATE UNIQUE INDEX engine_one_custody ON engine(project_id) WHERE custody;
ALTER TABLE engine ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine FORCE ROW LEVEL SECURITY;
CREATE POLICY engine_tenant ON engine TO opintel_app
 USING(project_id=current_setting('app.project_id',true)::uuid)
 WITH CHECK(project_id=current_setting('app.project_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON engine TO opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON engine TO opintel_platform;
GRANT ALL ON engine TO opintel_platform_admin;
ALTER TABLE data_source ADD COLUMN engine_id uuid;
ALTER TABLE data_source ADD CONSTRAINT source_engine_project FOREIGN KEY(project_id,engine_id) REFERENCES engine(project_id,id);
CREATE INDEX source_engine ON data_source(engine_id);
-- Existing sources deliberately remain unassigned. No guessed engine or legacy
-- file fallback: an operator must register, verify and explicitly assign them.
