DROP TRIGGER company_idp_z_configuration_revision ON company_idp;
DROP FUNCTION revise_company_idp_configuration();
DROP TABLE company_idp_sign_in;
ALTER TABLE company_idp DROP COLUMN scope;
ALTER TABLE company_idp DROP COLUMN configuration_version;
