-- Signing secrets are deployment environment material, never database state.
-- Previously issued public keys remain available until their grants expire.
ALTER TABLE release_signing_key DROP CONSTRAINT release_signing_key_check;
UPDATE release_signing_key SET retired_at=COALESCE(retired_at,clock_timestamp()),
 verify_until=GREATEST(verify_until,clock_timestamp()+interval '10 minutes',(SELECT max(expires_at) FROM release_grant g WHERE g.project_id=release_signing_key.project_id));
ALTER TABLE release_signing_key DROP COLUMN private_key;
ALTER TABLE release_signing_key ALTER COLUMN kid TYPE text USING kid::text;
ALTER TABLE release_signing_key ADD CONSTRAINT release_signing_deadline CHECK(retired_at IS NULL OR verify_until IS NOT NULL);
