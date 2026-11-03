-- Presence updates last_used_at on every request. Only changes to custody
-- compatibility need the pool serialization guard.
DROP TRIGGER credential_custody_guard ON pool_credential;
CREATE TRIGGER credential_custody_guard BEFORE INSERT OR UPDATE OF credential_kind,revoked_at,pool_id ON pool_credential FOR EACH ROW EXECUTE FUNCTION enforce_credential_custody();
