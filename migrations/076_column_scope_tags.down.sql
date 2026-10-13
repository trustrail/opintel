DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM catalog_element WHERE scope_tags<>'{}'::jsonb) THEN
 RAISE EXCEPTION 'Cannot downgrade while column scope tags exist';
 END IF;
END $$;
ALTER TABLE catalog_element DROP COLUMN scope_tags;
