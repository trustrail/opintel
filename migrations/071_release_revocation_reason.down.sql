-- Refuse to erase the reason attached to release history.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM release_event WHERE reason IS NOT NULL) THEN RAISE EXCEPTION 'Cannot remove custody revocation reasons while history exists'; END IF; END $$;
ALTER TABLE release_event DROP COLUMN reason;
