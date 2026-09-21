ALTER TABLE project ADD COLUMN token_key_version integer CHECK (token_key_version > 0);
CREATE TABLE token_key_version (
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0), sentinel_token text NOT NULL,
 state text NOT NULL CHECK(state IN ('current','retired')),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES user_account(id), reason text,
 backup_verified_at timestamptz, last_rehearsed_at timestamptz,
 last_rehearsal text CHECK(last_rehearsal IN ('ok','mismatch','failed')),
 PRIMARY KEY(project_id,version)
);
CREATE UNIQUE INDEX one_current_token_key ON token_key_version(project_id) WHERE state='current';
-- Durable operation intent is also the custody audit trail until general audit
-- infrastructure arrives. No key material is stored here.
CREATE TABLE token_key_operation (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES project(id),
 kind text NOT NULL CHECK(kind IN ('initialize','rotate','restore')),
 version integer NOT NULL, sentinel_token text NOT NULL, candidate_id uuid,
 actor_id uuid NOT NULL REFERENCES user_account(id), reason text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX one_pending_custody_operation ON token_key_operation(project_id) WHERE completed_at IS NULL;
ALTER TABLE token_key_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_key_version FORCE ROW LEVEL SECURITY;
CREATE POLICY token_key_version_tenant ON token_key_version TO opintel_app
 USING(project_id=current_setting('app.project_id',true)::uuid) WITH CHECK(project_id=current_setting('app.project_id',true)::uuid);
ALTER TABLE token_key_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_key_operation FORCE ROW LEVEL SECURITY;
CREATE POLICY token_key_operation_tenant ON token_key_operation TO opintel_app
 USING(project_id=current_setting('app.project_id',true)::uuid) WITH CHECK(project_id=current_setting('app.project_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON token_key_version,token_key_operation TO opintel_app;
-- Administrative reset/migration scope can truncate fixtures; normal roles
-- cannot delete version history or custody audit records.
GRANT TRUNCATE ON token_key_version,token_key_operation TO opintel_platform_admin;
