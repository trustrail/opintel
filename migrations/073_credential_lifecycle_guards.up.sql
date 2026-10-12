-- Fixed safe reasons for credential and legacy-alias lifecycle events.
ALTER TABLE release_event DROP CONSTRAINT release_event_reason_check;
ALTER TABLE release_event ADD CONSTRAINT release_event_reason_check CHECK(reason IS NULL OR reason IN ('provider changed','credential revoked','legacy alias grace ended'));
CREATE OR REPLACE FUNCTION public.bind_custody_alias() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c public.pool_credential; n integer;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.credential_id IS NULL THEN
   PERFORM id FROM public.pool WHERE id=NEW.pool_id AND project_id=NEW.project_id FOR UPDATE;
   SELECT count(*) INTO n FROM public.pool_credential WHERE pool_id=NEW.pool_id AND project_id=NEW.project_id;
   IF n>1 THEN RAISE EXCEPTION 'Choose a credential in this pool'; END IF;
   SELECT * INTO c FROM public.pool_credential WHERE pool_id=NEW.pool_id AND project_id=NEW.project_id;
   IF c.id IS NULL THEN
    INSERT INTO public.pool_credential(id,pool_id,project_id,label,custody_alias) SELECT NEW.id,NEW.pool_id,NEW.project_id,name,'agent:'||NEW.project_id::text||':'||NEW.id::text FROM public.pool WHERE id=NEW.pool_id AND project_id=NEW.project_id RETURNING * INTO c;
   END IF;
   NEW.credential_id:=c.id;
  ELSE SELECT * INTO c FROM public.pool_credential WHERE id=NEW.credential_id AND pool_id=NEW.pool_id AND project_id=NEW.project_id; END IF;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Credential must belong to its pool and project' USING ERRCODE='23503'; END IF;
  IF c.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Credential is revoked'; END IF;
  NEW.custody_alias:=c.custody_alias;
 ELSIF NEW.custody_alias IS DISTINCT FROM OLD.custody_alias OR NEW.credential_id IS DISTINCT FROM OLD.credential_id THEN RAISE EXCEPTION 'Credential custody identity is immutable'; END IF;
 RETURN NEW;
END $$;
