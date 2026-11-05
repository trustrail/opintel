-- New requests capture their authenticated public identity. Historical rows stay unknown.
ALTER TABLE query_run ADD COLUMN agent_identity jsonb;
