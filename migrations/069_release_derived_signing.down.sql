DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM release_signing_key WHERE kid ~ '^[0-9]+$') THEN
  RAISE EXCEPTION 'Cannot downgrade derived signing versions; verification history must be retained';
 END IF;
END $$;
ALTER TABLE release_signing_key DROP CONSTRAINT release_signing_deadline;
ALTER TABLE release_signing_key ALTER COLUMN kid TYPE uuid USING kid::uuid;
ALTER TABLE release_signing_key ADD COLUMN private_key bytea;
ALTER TABLE release_signing_key ADD CONSTRAINT release_signing_key_check CHECK((retired_at IS NULL)=(private_key IS NOT NULL));
