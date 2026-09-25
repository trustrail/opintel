-- References only: no credentials are resolved or copied by this migration.
ALTER TABLE company_idp DROP CONSTRAINT secret_is_reference;
ALTER TABLE data_source DROP CONSTRAINT credential_matches_origin;
UPDATE company_idp SET client_secret_ref='vault://' || substr(client_secret_ref,10) WHERE client_secret_ref LIKE 'secret://%';
UPDATE data_source SET credential_ref='vault://' || substr(credential_ref,10) WHERE credential_ref LIKE 'secret://%';
UPDATE demo_source_template SET deployment_ref=(
 SELECT coalesce(jsonb_object_agg(project,CASE WHEN deployment->>'credentialRef' LIKE 'secret://%'
 THEN jsonb_set(deployment,'{credentialRef}',to_jsonb('vault://' || substr(deployment->>'credentialRef',10))) ELSE deployment END),'{}'::jsonb)
 FROM jsonb_each(deployment_ref) AS entries(project,deployment)
);
ALTER TABLE company_idp ADD CONSTRAINT secret_is_reference CHECK (client_secret_ref LIKE 'vault://%');
ALTER TABLE data_source ADD CONSTRAINT credential_matches_origin CHECK (
 credential_ref IS NOT NULL AND credential_ref LIKE 'vault://%' AND
 (origin = 'customer' OR (origin = 'demo' AND demo_template_id IS NOT NULL))
);
