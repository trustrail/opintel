-- Restore the prior schema, never reclassify sources or change evidence.
ALTER TABLE data_source DROP CONSTRAINT source_credential_reference;
ALTER TABLE data_source DROP CONSTRAINT data_source_kind_check;
ALTER TABLE data_source DROP CONSTRAINT data_source_origin_check;
ALTER TABLE data_source ADD CONSTRAINT data_source_kind_check CHECK (kind IN ('postgres','demo'));
ALTER TABLE data_source ADD CONSTRAINT data_source_origin_check CHECK (origin IN ('customer','demo'));
CREATE TABLE demo_source_template (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), industry_id uuid NOT NULL REFERENCES industry(id) ON DELETE CASCADE, name text NOT NULL, kind text NOT NULL CHECK (kind IN ('postgres','spreadsheet')), narrative text, schema_spec jsonb NOT NULL, generator_spec jsonb NOT NULL, pack_version integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true, deployment_ref jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(deployment_ref)='object'));
CREATE UNIQUE INDEX demo_source_template_unique_name ON demo_source_template(industry_id,lower(name));
GRANT SELECT ON demo_source_template TO opintel_app,opintel_platform;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON demo_source_template TO opintel_platform_admin;
ALTER TABLE data_source ADD COLUMN demo_template_id uuid REFERENCES demo_source_template(id) ON DELETE RESTRICT;
ALTER TABLE data_source ADD CONSTRAINT credential_matches_origin CHECK (credential_ref IS NOT NULL AND credential_ref LIKE 'secret://%' AND (origin='customer' OR (origin='demo' AND demo_template_id IS NOT NULL)));
