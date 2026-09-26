CREATE TABLE bulk_decision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project(id),
 actor_id uuid NOT NULL,
 pool_id uuid NOT NULL,
 treatment text NOT NULL CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','withheld')),
 mask_kind text CHECK(mask_kind IN ('last4','email','year','all')),
 count integer NOT NULL CHECK(count>0),
 justification text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 CHECK((treatment='masked')=(mask_kind IS NOT NULL)),
 CHECK(treatment<>'clear' OR (justification IS NOT NULL AND length(btrim(justification))>0)),
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id)
);
CREATE INDEX bulk_decision_project_time ON bulk_decision(project_id,occurred_at DESC);
ALTER TABLE bulk_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON bulk_decision FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON bulk_decision FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT ON bulk_decision TO opintel_app;
GRANT SELECT,INSERT,TRUNCATE ON bulk_decision TO opintel_platform_admin;

-- Request receipts expire independently of the append-only decision history.
CREATE TABLE bulk_entitlement_request (
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 route text NOT NULL,
 request_key text NOT NULL,
 body_hash text NOT NULL,
 response jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 PRIMARY KEY(project_id,actor_id,route,request_key)
);
ALTER TABLE bulk_entitlement_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_entitlement_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON bulk_entitlement_request FOR SELECT USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON bulk_entitlement_request FOR ALL USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid) WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON bulk_entitlement_request TO opintel_app;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON bulk_entitlement_request TO opintel_platform_admin;
