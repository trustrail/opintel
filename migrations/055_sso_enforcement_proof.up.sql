-- A revision changes even when a configuration is changed and later restored.
ALTER TABLE company_idp ADD COLUMN configuration_version uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE company_idp ADD COLUMN scope text NOT NULL DEFAULT 'openid email profile'
 CHECK (scope ~ '(^| )openid( |$)' AND scope !~ '[[:cntrl:]]');
CREATE TABLE company_idp_sign_in (
 idp_id uuid NOT NULL REFERENCES company_idp(id) ON DELETE CASCADE,
 configuration_version uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,
 completed_at timestamptz NOT NULL,
 PRIMARY KEY(idp_id,configuration_version,user_id)
);
REVOKE ALL ON company_idp_sign_in FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin;
GRANT SELECT,INSERT ON company_idp_sign_in TO opintel_platform;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON company_idp_sign_in TO opintel_platform_admin;
-- The existing company_idp_settings_lock trigger takes the same company lock
-- used by the enforcement write and proof recording. This trigger sorts after it.
CREATE FUNCTION revise_company_idp_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN
  IF EXISTS(SELECT 1 FROM company WHERE id=OLD.company_id AND sso_enforced) THEN
   RAISE EXCEPTION 'Disable SSO enforcement before changing provider configuration.'
    USING ERRCODE='23514',CONSTRAINT='company_sso_configuration_locked';
  END IF;
  NEW.configuration_version:=gen_random_uuid();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER company_idp_z_configuration_revision BEFORE UPDATE ON company_idp
 FOR EACH ROW EXECUTE FUNCTION revise_company_idp_configuration();
