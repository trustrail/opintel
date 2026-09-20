-- Existing credential-less demos need a real operator-provisioned Vault reference.
-- Do not invent credentials, delete sources, or silently disable their constraint.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM data_source WHERE credential_ref IS NULL) THEN
  RAISE EXCEPTION 'Demo credential migration requires backfill: configure Vault references for credential-less sources before applying 023';
 END IF;
END $$;
ALTER TABLE data_source DROP CONSTRAINT credential_matches_origin;
ALTER TABLE data_source ADD CONSTRAINT credential_matches_origin CHECK (
 credential_ref IS NOT NULL AND credential_ref LIKE 'vault://%' AND
 (origin = 'customer' OR (origin = 'demo' AND demo_template_id IS NOT NULL))
);
