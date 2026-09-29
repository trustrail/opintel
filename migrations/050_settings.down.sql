DROP FUNCTION save_project_settings(jsonb);
DROP TRIGGER company_idp_sso_one_enabled ON company_idp;
DROP TRIGGER company_sso_one_enabled_idp ON company;
DROP TRIGGER company_idp_settings_lock ON company_idp;
DROP FUNCTION check_company_sso_settings();
DROP FUNCTION lock_company_idp_settings();
ALTER TABLE user_account DROP COLUMN reduced_motion, DROP COLUMN date_format;
-- Keep explicit discovery settings: removing them would lose user decisions.
