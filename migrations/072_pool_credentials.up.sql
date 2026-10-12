-- Credentials own identity; key versions own authentication material only.
CREATE TABLE pool_credential (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pool_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 custody_alias text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz,
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id) ON DELETE CASCADE,
 UNIQUE(id,pool_id,project_id)
);
ALTER TABLE pool_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_credential FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON pool_credential FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON pool_credential FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON pool_credential TO opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON pool_credential TO opintel_platform_admin;
INSERT INTO pool_credential(id,pool_id,project_id,label,custody_alias,created_at)
SELECT COALESCE(k.id,p.id),p.id,p.project_id,p.name,COALESCE(k.custody_alias,'agent:'||p.project_id::text||':'||p.id::text),p.created_at
FROM pool p LEFT JOIN LATERAL(SELECT id,custody_alias FROM pool_key WHERE pool_id=p.id ORDER BY (state='current') DESC,created_at DESC,id DESC LIMIT 1) k ON true;
ALTER TABLE pool_key ADD COLUMN credential_id uuid;
ALTER TABLE pool_key ADD COLUMN alias_retired_at timestamptz;
UPDATE pool_key k SET credential_id=c.id FROM pool_credential c WHERE c.pool_id=k.pool_id;
ALTER TABLE pool_key ALTER COLUMN credential_id SET NOT NULL;
UPDATE pool_credential c SET last_used_at=(SELECT max(a.last_seen) FROM agent_presence a JOIN pool_key k ON k.id=a.key_version WHERE k.credential_id=c.id);
ALTER TABLE pool_key ADD FOREIGN KEY(credential_id,pool_id,project_id) REFERENCES pool_credential(id,pool_id,project_id);
DROP INDEX one_current_key_per_pool;
DROP INDEX one_retiring_key_per_pool;
CREATE UNIQUE INDEX one_current_key_per_credential ON pool_key(credential_id) WHERE state='current';
CREATE UNIQUE INDEX one_retiring_key_per_credential ON pool_key(credential_id) WHERE state='retiring';
CREATE FUNCTION public.bind_pool_credential() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c public.pool_credential;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.custody_alias IS DISTINCT FROM OLD.custody_alias OR NEW.id<>OLD.id OR NEW.pool_id<>OLD.pool_id OR NEW.project_id<>OLD.project_id) THEN RAISE EXCEPTION 'Credential identity is immutable'; END IF;
 IF TG_OP='INSERT' THEN NEW.custody_alias:='agent:'||NEW.project_id::text||':'||NEW.id::text; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_pool_credential() FROM PUBLIC;
CREATE TRIGGER pool_credential_identity BEFORE INSERT OR UPDATE ON pool_credential FOR EACH ROW EXECUTE FUNCTION public.bind_pool_credential();
-- Old operator/bootstrap inserts may omit credential_id only for an unambiguous
-- one-credential pool. There is no pool-wide default once it has several.
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
  IF c.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Credential is revoked'; END IF;
  NEW.custody_alias:=c.custody_alias;
 ELSIF NEW.custody_alias IS DISTINCT FROM OLD.custody_alias OR NEW.credential_id IS DISTINCT FROM OLD.credential_id THEN RAISE EXCEPTION 'Credential custody identity is immutable'; END IF;
 RETURN NEW;
END $$;
-- Immutable snapshots, not mutable foreign keys; historical receipts are not backfilled.
ALTER TABLE query_run ADD COLUMN credential_id uuid;
ALTER TABLE query_run ADD COLUMN custody_alias text;
CREATE FUNCTION public.resolve_pool_credential(digest bytea) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT k.credential_id FROM public.pool_key k JOIN public.pool_credential c ON c.id=k.credential_id WHERE k.key_hash=digest AND c.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.resolve_pool_credential(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_pool_credential(bytea) TO opintel_platform;
CREATE FUNCTION public.pending_credential_alias_cleanup() RETURNS TABLE(project_id uuid,user_id uuid,key_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT k.project_id,k.created_by,k.id FROM public.pool_key k JOIN public.pool_credential c ON c.id=k.credential_id WHERE k.custody_alias<>c.custody_alias AND k.alias_retired_at IS NULL AND (k.state IN ('revoked','expired') OR k.grace_until<=now())
$$;
REVOKE ALL ON FUNCTION public.pending_credential_alias_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_credential_alias_cleanup() TO opintel_platform;

ALTER TABLE evidence_rollup ADD COLUMN credential_id uuid;
ALTER TABLE evidence_rollup ADD COLUMN custody_alias text;
-- Retention preserves immutable caller identity without consulting current keys.
CREATE FUNCTION public.rollup_credential_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 SELECT credential_id,custody_alias INTO NEW.credential_id,NEW.custody_alias FROM public.query_run WHERE id=NEW.id AND started_at=NEW.started_at;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rollup_credential_snapshot() FROM PUBLIC;
CREATE TRIGGER rollup_credential_snapshot BEFORE INSERT ON evidence_rollup FOR EACH ROW EXECUTE FUNCTION public.rollup_credential_snapshot();
CREATE OR REPLACE VIEW evidence_run_read WITH(security_invoker=true) AS
 SELECT r.id,r.project_id,r.pool_id,r.agent_id,r.key_prefix,r.mode,r.request,r.versions,r.started_at,r.capture_percent,r.capture_selected, 'full'::text AS record_kind,NULL::timestamptz AS rolled_up_at,'{}'::jsonb AS treatment_counts,'{}'::jsonb AS source_treatment_counts,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('at',e.redacted_at,'policy',e.policy,'fields',e.fields) ORDER BY e.redacted_at,e.id) FROM evidence_redaction e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]'::jsonb) AS redactions,r.credential_id,r.custody_alias
 FROM query_run r
 UNION ALL
 SELECT id,project_id,pool_id,agent_id,key_prefix,mode,NULL::text,versions,started_at,capture_percent,capture_selected,'rollup',created_at,treatment_counts,source_treatment_counts,redactions,credential_id,custody_alias FROM evidence_rollup;
