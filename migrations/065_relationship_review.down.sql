DO $$ BEGIN IF EXISTS(SELECT 1 FROM token_join_review) THEN RAISE EXCEPTION 'Cannot downgrade while relationship review history exists'; END IF; END $$;
DROP TABLE token_join_review;
