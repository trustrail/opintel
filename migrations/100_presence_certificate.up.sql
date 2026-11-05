-- Snapshot public certificate metadata from successful authentication; never backfill from a current binding.
ALTER TABLE agent_presence ADD COLUMN certificate_identity jsonb;
