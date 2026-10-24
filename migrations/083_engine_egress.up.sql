ALTER TABLE engine ADD COLUMN egress_applied_version text CHECK (egress_applied_version ~ '^[a-f0-9]{64}$');
ALTER TABLE engine ADD COLUMN egress_heartbeat_at timestamptz;
ALTER TABLE data_source ADD COLUMN egress_pending boolean NOT NULL DEFAULT false;
