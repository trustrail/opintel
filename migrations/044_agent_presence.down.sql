DROP TABLE agent_presence;
ALTER TABLE pool_key DROP CONSTRAINT pool_key_presence_identity;
ALTER TABLE project DROP CONSTRAINT presence_settings_valid;
