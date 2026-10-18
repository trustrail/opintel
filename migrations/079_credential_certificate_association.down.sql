DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pool_credential WHERE association_recorded_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Cannot discard recorded credential certificate associations';
 END IF;
END $$;
ALTER TABLE pool_credential
 DROP CONSTRAINT credential_association_complete,
 DROP COLUMN certificate_id,
 DROP COLUMN device_name,
 DROP COLUMN recipient_identifier,
 DROP COLUMN identity_kind,
 DROP COLUMN association_status,
 DROP COLUMN association_recorded_at;
