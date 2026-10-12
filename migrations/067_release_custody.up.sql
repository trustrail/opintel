-- Release shares are mutable secrets; release events are immutable evidence.
-- Neither a full release key nor a provider share belongs in these tables.
ALTER TABLE entitlement DROP CONSTRAINT entitlement_treatment_check;
ALTER TABLE entitlement ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','custody','withheld'));
ALTER TABLE pattern_rule DROP CONSTRAINT pattern_rule_treatment_check;
ALTER TABLE pattern_rule ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','custody','withheld'));
ALTER TABLE bulk_decision DROP CONSTRAINT bulk_decision_treatment_check;
ALTER TABLE bulk_decision ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','custody','withheld'));
ALTER TABLE run_element DROP CONSTRAINT run_element_treatment_check;
ALTER TABLE run_element ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','custody'));
ALTER TABLE pool_key ADD COLUMN custody_alias text;
UPDATE pool_key SET custody_alias='agent:'||project_id::text||':'||id::text;
ALTER TABLE pool_key ALTER COLUMN custody_alias SET NOT NULL;
CREATE FUNCTION public.bind_custody_alias() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.custody_alias:='agent:'||NEW.project_id::text||':'||NEW.id::text;
 ELSIF NEW.custody_alias IS DISTINCT FROM OLD.custody_alias THEN RAISE EXCEPTION 'Credential custody alias is immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_custody_alias() FROM PUBLIC;
CREATE TRIGGER pool_key_custody_alias BEFORE INSERT OR UPDATE ON pool_key FOR EACH ROW EXECUTE FUNCTION public.bind_custody_alias();

CREATE TABLE release_grant(
 id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES project(id),scope_user_id uuid NOT NULL REFERENCES user_account(id),
 receipt_id uuid NOT NULL,claims jsonb NOT NULL,grant_jws text NOT NULL,
 expires_at timestamptz NOT NULL,share bytea CHECK(share IS NULL OR octet_length(share)=32),
 state text NOT NULL CHECK(state IN ('granted','redeemed','expired','revoked')),
 escrow_revoked boolean NOT NULL DEFAULT false,
 CHECK((state='granted')=(share IS NOT NULL))
);
CREATE INDEX release_grant_cleanup ON release_grant(expires_at) WHERE NOT escrow_revoked;
ALTER TABLE release_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON release_grant FOR SELECT TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON release_grant FOR ALL TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON release_grant TO opintel_app;
GRANT TRUNCATE ON release_grant TO opintel_platform_admin;
CREATE TABLE release_event(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,project_id uuid NOT NULL REFERENCES project(id),
 grant_id uuid NOT NULL REFERENCES release_grant(id),receipt_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('granted','redeemed','expired','revoked','provider_redeemed')),
 occurred_at timestamptz NOT NULL,alias text NOT NULL,actor text,jur_observed text,
 UNIQUE(grant_id,kind)
);
ALTER TABLE release_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON release_event FOR SELECT TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON release_event FOR INSERT TO opintel_app WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND EXISTS(SELECT 1 FROM release_grant g WHERE g.id=grant_id AND g.project_id=release_event.project_id AND g.receipt_id=release_event.receipt_id));
GRANT SELECT,INSERT ON release_event TO opintel_app;
GRANT USAGE ON SEQUENCE release_event_id_seq TO opintel_app;
GRANT TRUNCATE ON release_event TO opintel_platform_admin;
CREATE TABLE release_signing_key(
 project_id uuid NOT NULL REFERENCES project(id),kid uuid NOT NULL,private_key bytea,
 public_key jsonb NOT NULL,retired_at timestamptz,verify_until timestamptz,
 PRIMARY KEY(project_id,kid),CHECK((retired_at IS NULL)=(private_key IS NOT NULL))
);
CREATE UNIQUE INDEX release_signing_current ON release_signing_key(project_id) WHERE retired_at IS NULL;
ALTER TABLE release_signing_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_signing_key FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON release_signing_key FOR SELECT TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON release_signing_key FOR ALL TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON release_signing_key TO opintel_app;
GRANT TRUNCATE ON release_signing_key TO opintel_platform_admin;
-- Credential-bound alias lookup exposes no key hash or other tenant state.
CREATE FUNCTION public.resolve_custody_alias(digest bytea) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT custody_alias FROM public.pool_key WHERE key_hash=digest
$$;
REVOKE ALL ON FUNCTION public.resolve_custody_alias(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_custody_alias(bytea) TO opintel_platform;
