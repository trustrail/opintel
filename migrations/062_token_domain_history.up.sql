-- Assignment versions describe history; they never enter the HMAC payload.
CREATE TABLE token_domain_assignment (
 project_id uuid NOT NULL REFERENCES project(id),
 element_id uuid NOT NULL REFERENCES catalog_element(id),
 version integer NOT NULL CHECK(version>0),
 declared_domain text,
 effective_domain text NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid,
 provenance text NOT NULL CHECK(provenance IN ('baseline','assignment')),
 PRIMARY KEY(element_id,version)
);
INSERT INTO token_domain_assignment(project_id,element_id,version,declared_domain,effective_domain,provenance)
 SELECT project_id,id,1,token_domain,COALESCE(token_domain,'opintelisolated'||replace(project_id::text,'-','')||replace(id::text,'-','')),'baseline' FROM catalog_element;
ALTER TABLE token_domain_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_domain_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON token_domain_assignment FOR SELECT TO opintel_app
 USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT ON token_domain_assignment TO opintel_app;
CREATE FUNCTION public.record_token_domain_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE next_version integer;
BEGIN
 IF TG_OP='UPDATE' AND NEW.token_domain IS NOT DISTINCT FROM OLD.token_domain THEN RETURN NEW; END IF;
 SELECT COALESCE(max(version),0)+1 INTO next_version FROM public.token_domain_assignment WHERE element_id=NEW.id;
 INSERT INTO public.token_domain_assignment(project_id,element_id,version,declared_domain,effective_domain,actor_id,provenance)
 VALUES(NEW.project_id,NEW.id,next_version,NEW.token_domain,COALESCE(NEW.token_domain,'opintelisolated'||replace(NEW.project_id::text,'-','')||replace(NEW.id::text,'-','')),NULLIF(current_setting('app.user_id',true),'')::uuid,'assignment');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_token_domain_assignment() FROM PUBLIC;
CREATE TRIGGER token_domain_assignment AFTER INSERT OR UPDATE OF token_domain ON catalog_element FOR EACH ROW EXECUTE FUNCTION public.record_token_domain_assignment();
