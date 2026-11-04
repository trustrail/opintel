DROP TRIGGER credential_custody_guard ON pool_credential;
CREATE TRIGGER credential_custody_guard BEFORE INSERT OR UPDATE ON pool_credential FOR EACH ROW EXECUTE FUNCTION enforce_credential_custody();
