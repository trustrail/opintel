DO $$ BEGIN IF EXISTS(SELECT 1 FROM query_run WHERE agent_identity IS NOT NULL) THEN RAISE EXCEPTION 'Cannot remove recorded certificate evidence'; END IF; END $$;
ALTER TABLE query_run DROP COLUMN agent_identity;
