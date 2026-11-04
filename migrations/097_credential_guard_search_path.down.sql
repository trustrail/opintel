CREATE OR REPLACE FUNCTION public.enforce_credential_custody() RETURNS trigger LANGUAGE plpgsql AS $$
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
