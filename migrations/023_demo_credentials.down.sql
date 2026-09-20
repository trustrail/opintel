ALTER TABLE data_source DROP CONSTRAINT credential_matches_origin;
ALTER TABLE data_source ADD CONSTRAINT credential_matches_origin CHECK (
 (origin = 'customer' AND credential_ref IS NOT NULL AND credential_ref LIKE 'vault://%') OR
 (origin = 'demo' AND credential_ref IS NULL AND demo_template_id IS NOT NULL)
);
