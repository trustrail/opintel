ALTER TABLE project ADD CONSTRAINT presence_settings_valid CHECK (
 (NOT(settings ? 'agentHeartbeatSeconds') OR (jsonb_typeof(settings->'agentHeartbeatSeconds')='number' AND (settings->>'agentHeartbeatSeconds')::numeric BETWEEN 5 AND 60 AND (settings->>'agentHeartbeatSeconds')::numeric=trunc((settings->>'agentHeartbeatSeconds')::numeric))) AND
 (NOT(settings ? 'agentDisconnectGraceSeconds') OR (jsonb_typeof(settings->'agentDisconnectGraceSeconds')='number' AND (settings->>'agentDisconnectGraceSeconds')::numeric BETWEEN 60 AND 3600 AND (settings->>'agentDisconnectGraceSeconds')::numeric=trunc((settings->>'agentDisconnectGraceSeconds')::numeric)))
);
ALTER TABLE pool_key ADD CONSTRAINT pool_key_presence_identity UNIQUE(id,pool_id,project_id);
CREATE TABLE agent_presence (
 pool_id uuid NOT NULL,
 agent_id text COLLATE "C" NOT NULL CHECK(length(btrim(agent_id))>0),
 project_id uuid NOT NULL REFERENCES project(id),
 client text,
 verified boolean NOT NULL DEFAULT false CHECK(verified=false),
 key_version uuid NOT NULL,
 first_seen timestamptz NOT NULL,
 last_seen timestamptz NOT NULL,
 last_request_at timestamptz,
 last_heartbeat_at timestamptz NOT NULL,
 stale_at timestamptz,
 reconnects integer NOT NULL DEFAULT 0 CHECK(reconnects>=0),
 state text NOT NULL CHECK(state IN ('connecting','active','idle','stale','disconnected')),
 PRIMARY KEY(pool_id,agent_id),
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id) ON DELETE CASCADE,
 FOREIGN KEY(key_version,pool_id,project_id) REFERENCES pool_key(id,pool_id,project_id),
 CHECK((state IN ('stale','disconnected'))=(stale_at IS NOT NULL)),
 CHECK(last_seen>=first_seen AND last_heartbeat_at>=first_seen)
);
CREATE INDEX agent_presence_project ON agent_presence(project_id,pool_id,agent_id);
CREATE INDEX agent_presence_key ON agent_presence(pool_id,key_version);
ALTER TABLE agent_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_presence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON agent_presence FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON agent_presence FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
-- Presence expires into a visible disconnected row, never into deletion.
GRANT SELECT,INSERT,UPDATE ON agent_presence TO opintel_app;
GRANT SELECT,INSERT,UPDATE,TRUNCATE ON agent_presence TO opintel_platform_admin;
