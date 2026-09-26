ALTER TABLE project ADD CONSTRAINT pool_key_grace_seconds_valid CHECK (
 NOT(settings ? 'poolKeyGraceSeconds') OR
 (jsonb_typeof(settings->'poolKeyGraceSeconds')='number' AND
 (settings->>'poolKeyGraceSeconds')::numeric BETWEEN 3600 AND 604800 AND
 (settings->>'poolKeyGraceSeconds')::numeric=trunc((settings->>'poolKeyGraceSeconds')::numeric))
);
-- Only the redacted response is durable. A replay can never recover a credential.
CREATE TABLE pool_key_request (
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, route text NOT NULL, request_key text NOT NULL,
 body_hash text NOT NULL, response jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(project_id,actor_id,route,request_key),
 CHECK(response @> '{"keyShown":false}'::jsonb AND NOT(response ? 'key'))
);
ALTER TABLE pool_key_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_key_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON pool_key_request FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON pool_key_request FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON pool_key_request TO opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON pool_key_request TO opintel_platform_admin;
-- Authentication has no tenant yet. This hash-only lookup is the narrow bootstrap;
-- platform retains no SELECT privilege on either tenant table.
CREATE FUNCTION public.resolve_pool_key(digest bytea)
RETURNS TABLE(pool_id uuid,project_id uuid,name text,mode_query boolean,mode_prompt boolean,clarification_policy text,key_prefix text,state text,grace_until timestamptz,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT p.id,p.project_id,p.name,p.mode_query,p.mode_prompt,p.clarification_policy,k.key_prefix,k.state,k.grace_until,k.created_at
 FROM public.pool_key k JOIN public.pool p ON p.id=k.pool_id AND p.project_id=k.project_id
 JOIN public.project project ON project.id=p.project_id
 WHERE k.key_hash=digest AND octet_length(digest)=32 AND project.archived_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.resolve_pool_key(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_pool_key(bytea) TO opintel_platform;
