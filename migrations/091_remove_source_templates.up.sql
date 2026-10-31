ALTER TABLE data_source DROP CONSTRAINT credential_matches_origin;
ALTER TABLE data_source DROP COLUMN demo_template_id;
DROP TABLE demo_source_template;
ALTER TABLE data_source DROP CONSTRAINT data_source_kind_check;
ALTER TABLE data_source DROP CONSTRAINT data_source_origin_check;
ALTER TABLE data_source ADD CONSTRAINT data_source_kind_check CHECK (kind='postgres');
ALTER TABLE data_source ADD CONSTRAINT data_source_origin_check CHECK (origin='customer');
ALTER TABLE data_source ADD CONSTRAINT source_credential_reference CHECK (credential_ref IS NOT NULL AND credential_ref LIKE 'secret://%');
