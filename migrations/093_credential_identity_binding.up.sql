ALTER TABLE pool_credential
 ADD COLUMN credential_kind text NOT NULL DEFAULT 'identity-bound' CHECK (credential_kind IN ('identity-bound','bearer-only')),
 ADD COLUMN binding_status text NOT NULL DEFAULT 'unbound' CHECK (binding_status IN ('unbound','pending','bound','reset')),
 ADD COLUMN certificate_fingerprint text CHECK (certificate_fingerprint ~ '^[0-9a-f]{64}$'),
 ADD COLUMN certificate_subject text,
 ADD COLUMN bound_at timestamptz,
 ADD COLUMN enrollment_recipient_identifier text,
 ADD CONSTRAINT credential_binding_complete CHECK (
  (binding_status IN ('unbound','reset') AND certificate_fingerprint IS NULL AND certificate_subject IS NULL AND bound_at IS NULL) OR
  (binding_status='pending' AND certificate_fingerprint IS NOT NULL AND certificate_subject IS NOT NULL AND bound_at IS NULL AND credential_kind='identity-bound') OR
  (binding_status='bound' AND certificate_fingerprint IS NOT NULL AND certificate_subject IS NOT NULL AND bound_at IS NOT NULL AND credential_kind='identity-bound')
 );
-- Preserve existing non-custody clients. Existing custody recipients constrain
-- first enrollment; no issued receipt or grant is rewritten.
UPDATE pool_credential c SET credential_kind=CASE WHEN recipient_identifier IS NOT NULL OR EXISTS(
 SELECT 1 FROM entitlement e WHERE e.pool_id=c.pool_id AND e.treatment='custody'
) THEN 'identity-bound' ELSE 'bearer-only' END,
 enrollment_recipient_identifier=recipient_identifier;
-- Serialize both sides of the custody/credential invariant on the pool row.
CREATE FUNCTION enforce_credential_custody() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE labels text;
BEGIN
 PERFORM id FROM pool WHERE id=NEW.pool_id FOR UPDATE;
 IF TG_TABLE_NAME='pool_credential' THEN
  IF NEW.credential_kind='bearer-only' AND NEW.revoked_at IS NULL AND EXISTS(SELECT 1 FROM entitlement WHERE pool_id=NEW.pool_id AND treatment='custody') THEN
   RAISE EXCEPTION 'Bearer-only credentials cannot be issued for a pool with custody columns' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.treatment='custody' THEN
   SELECT string_agg(label,', ' ORDER BY label) INTO labels FROM pool_credential WHERE pool_id=NEW.pool_id AND credential_kind='bearer-only' AND revoked_at IS NULL;
   IF labels IS NOT NULL THEN RAISE EXCEPTION 'Custody requires identity-bound credentials; bearer-only credentials: %',labels USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION enforce_credential_custody() FROM PUBLIC;
CREATE TRIGGER credential_custody_guard BEFORE INSERT OR UPDATE ON pool_credential FOR EACH ROW EXECUTE FUNCTION enforce_credential_custody();
CREATE TRIGGER entitlement_credential_guard BEFORE INSERT OR UPDATE ON entitlement FOR EACH ROW EXECUTE FUNCTION enforce_credential_custody();
