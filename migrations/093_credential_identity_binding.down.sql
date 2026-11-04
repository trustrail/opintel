DROP TRIGGER entitlement_credential_guard ON entitlement;
DROP TRIGGER credential_custody_guard ON pool_credential;
DROP FUNCTION enforce_credential_custody();
ALTER TABLE pool_credential
 DROP CONSTRAINT credential_binding_complete,
 DROP COLUMN enrollment_recipient_identifier,
 DROP COLUMN bound_at,
 DROP COLUMN certificate_subject,
 DROP COLUMN certificate_fingerprint,
 DROP COLUMN binding_status,
 DROP COLUMN credential_kind;
