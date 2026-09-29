-- The header is the durable request-start fact. Absence of a completion is
-- incomplete evidence, never absence of a request. No customer row data lives here.
CREATE TABLE query_run (
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project(id),
 pool_id uuid NOT NULL,
 agent_id text,
 key_prefix text NOT NULL,
 mode text NOT NULL CHECK (mode IN ('query','prompt')),
 request text NOT NULL,
 versions jsonb NOT NULL CHECK (
   jsonb_typeof(versions)='object' AND versions ?& ARRAY['policy','vocabulary','catalog','tokenKey']
   AND jsonb_typeof(versions->'policy')='number' AND (versions->>'policy') ~ '^[0-9]+$'
   AND jsonb_typeof(versions->'vocabulary')='number' AND (versions->>'vocabulary') ~ '^[0-9]+$'
   AND jsonb_typeof(versions->'catalog')='number' AND (versions->>'catalog') ~ '^[0-9]+$'
   AND jsonb_typeof(versions->'tokenKey')='number' AND (versions->>'tokenKey') ~ '^[0-9]+$'),
 started_at timestamptz NOT NULL CHECK (isfinite(started_at)),
 PRIMARY KEY (id,started_at),
 FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id)
) PARTITION BY RANGE(started_at);
CREATE INDEX query_run_project_time ON query_run(project_id,started_at DESC,id);

-- One terminal fact, with the full tagged RunOutcome (counts, truncation,
-- refusal stage/code, clarification link or failure retryability).
CREATE TABLE run_completion (
 run_id uuid NOT NULL,
 started_at timestamptz NOT NULL,
 outcome jsonb NOT NULL CHECK (
   jsonb_typeof(outcome)='object' AND outcome ? 'kind'
   AND outcome->>'kind' IN ('answered','reduced','refused','clarify','failed')),
 CHECK(COALESCE(CASE outcome->>'kind'
   WHEN 'answered' THEN outcome ?& ARRAY['rowCount','truncated'] AND jsonb_typeof(outcome->'rowCount')='number' AND (outcome->>'rowCount') ~ '^[0-9]+$' AND jsonb_typeof(outcome->'truncated')='boolean'
   WHEN 'reduced' THEN outcome ?& ARRAY['rowCount','truncated','withheld'] AND jsonb_typeof(outcome->'rowCount')='number' AND (outcome->>'rowCount') ~ '^[0-9]+$' AND jsonb_typeof(outcome->'truncated')='boolean' AND jsonb_typeof(outcome->'withheld')='number' AND (outcome->>'withheld') ~ '^[0-9]+$'
   WHEN 'refused' THEN outcome ?& ARRAY['code','element','stage'] AND jsonb_typeof(outcome->'code')='string' AND length(outcome->>'code')>0 AND jsonb_typeof(outcome->'element') IN ('string','null') AND outcome->>'stage' IN ('classify','recover','resolve_values','resolve_sources','compose','validate','qqc_l1','qqc_l2','qqc_l3','execute','record')
   WHEN 'clarify' THEN outcome ?& ARRAY['items','resumedAs'] AND jsonb_typeof(outcome->'items')='number' AND (outcome->>'items') ~ '^[0-9]+$' AND (outcome->'resumedAs'='null'::jsonb OR (jsonb_typeof(outcome->'resumedAs')='string' AND (outcome->>'resumedAs') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
   WHEN 'failed' THEN outcome ?& ARRAY['code','retryable'] AND jsonb_typeof(outcome->'code')='string' AND length(outcome->>'code')>0 AND jsonb_typeof(outcome->'retryable')='boolean'
   ELSE false END,false)),
 cil jsonb CHECK(cil IS NULL OR jsonb_typeof(cil)='object'),
 source_plan jsonb CHECK(source_plan IS NULL OR jsonb_typeof(source_plan)='object'),
 generated_sql text,
 latency_ms integer CHECK(latency_ms>=0),
 freshness jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(freshness)='object'),
 synthetic boolean NOT NULL DEFAULT false,
 completed_at timestamptz NOT NULL CHECK(isfinite(completed_at) AND completed_at>=started_at),
 PRIMARY KEY(run_id,started_at),
 FOREIGN KEY(run_id,started_at) REFERENCES query_run(id,started_at)
) PARTITION BY RANGE(started_at);

CREATE TABLE run_element (
 run_id uuid NOT NULL,
 started_at timestamptz NOT NULL,
 element_id uuid,
 exposed_name text NOT NULL CHECK(length(exposed_name)>0),
 state text NOT NULL CHECK(state IN ('released','withheld','undecided','aggregated')),
 treatment text CHECK(treatment IN ('clear','tokenized','masked','aggregate_only')),
 withheld_reason text,
 CHECK((treatment IS NULL) = (state IN ('withheld','undecided'))),
 FOREIGN KEY(run_id,started_at) REFERENCES query_run(id,started_at)
) PARTITION BY RANGE(started_at);
CREATE INDEX run_element_run ON run_element(run_id,started_at);

CREATE TABLE run_stage (
 run_id uuid NOT NULL,
 started_at timestamptz NOT NULL,
 stage text NOT NULL CHECK(stage IN ('classify','recover','resolve_values','resolve_sources','compose','validate','qqc_l1','qqc_l2','qqc_l3','execute','record')),
 result text NOT NULL CHECK(result IN ('ok','clarify','refuse','warn')),
 detail jsonb CHECK(detail IS NULL OR jsonb_typeof(detail)='object'),
 ms integer NOT NULL CHECK(ms>=0),
 FOREIGN KEY(run_id,started_at) REFERENCES query_run(id,started_at)
) PARTITION BY RANGE(started_at);
CREATE INDEX run_stage_run ON run_stage(run_id,started_at);

-- Serialize terminal insertion with child appends, including direct partition
-- inserts. A completed aggregate cannot gain later stages or deliveries.
CREATE FUNCTION public.guard_evidence_append() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.run_id::text||':'||extract(epoch FROM NEW.started_at)::text,0));
 IF TG_ARGV[0]='child' AND EXISTS(SELECT 1 FROM public.run_completion WHERE run_id=NEW.run_id AND started_at=NEW.started_at) THEN
  RAISE EXCEPTION 'A completed evidence record is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_evidence_append() FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin;
CREATE TRIGGER evidence_completion BEFORE INSERT ON run_completion FOR EACH ROW EXECUTE FUNCTION public.guard_evidence_append('completion');
CREATE TRIGGER evidence_element BEFORE INSERT ON run_element FOR EACH ROW EXECUTE FUNCTION public.guard_evidence_append('child');
CREATE TRIGGER evidence_stage BEFORE INSERT ON run_stage FOR EACH ROW EXECUTE FUNCTION public.guard_evidence_append('child');

CREATE TABLE audit_entry (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid REFERENCES project(id),
 company_id uuid REFERENCES company(id),
 actor_id uuid,
 actor_kind text NOT NULL CHECK(actor_kind IN ('user','system','rule')),
 action text NOT NULL,
 target jsonb NOT NULL CHECK(jsonb_typeof(target)='object'),
 before jsonb,
 after jsonb,
 revision text,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entry_project_time ON audit_entry(project_id,occurred_at DESC);
ALTER TABLE audit_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON audit_entry FOR SELECT TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
CREATE POLICY tenant_write ON audit_entry FOR INSERT TO opintel_app WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
-- Company/platform events use the existing non-tenant scopes, never app's
-- null project setting. These roles cannot see another project's audit rows.
CREATE POLICY platform_read ON audit_entry FOR SELECT TO opintel_platform,opintel_platform_admin USING(project_id IS NULL);
CREATE POLICY platform_write ON audit_entry FOR INSERT TO opintel_platform,opintel_platform_admin WITH CHECK(project_id IS NULL);
REVOKE ALL ON audit_entry FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin;
GRANT SELECT,INSERT ON audit_entry TO opintel_app,opintel_platform,opintel_platform_admin;
GRANT TRUNCATE ON audit_entry TO opintel_platform_admin;

DO $$
DECLARE t text; predicate text;
BEGIN
 FOREACH t IN ARRAY ARRAY['query_run','run_completion','run_element','run_stage'] LOOP
  predicate := CASE WHEN t='query_run'
    THEN 'project_id=NULLIF(current_setting(''app.project_id'',true),'''')::uuid'
    ELSE format('EXISTS (SELECT 1 FROM public.query_run r WHERE r.id=%I.run_id AND r.started_at=%I.started_at)',t,t) END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT USING (%s)',t,predicate);
  EXECUTE format('CREATE POLICY tenant_write ON public.%I FOR INSERT WITH CHECK (%s)',t,predicate);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin',t);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO opintel_app,opintel_platform_admin',t);
  EXECUTE format('GRANT TRUNCATE ON public.%I TO opintel_platform_admin',t);
 END LOOP;
END $$;

-- Owner-only DDL. No application role can create/drop partitions or grant
-- itself writes. Retention scheduling and deletion are item 5.17.
CREATE FUNCTION public.ensure_evidence_month(p_month date) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE month_start date; month_end date; parent_name text; child_name text; predicate text;
BEGIN
 IF p_month IS NULL OR NOT isfinite(p_month) THEN RAISE EXCEPTION 'A finite evidence month is required'; END IF;
 month_start := date_trunc('month',p_month::timestamp)::date;
 month_end := (month_start+interval '1 month')::date;
 PERFORM pg_advisory_xact_lock(hashtextextended('opintel-evidence-partitions',0));
 FOREACH parent_name IN ARRAY ARRAY['query_run','run_completion','run_element','run_stage'] LOOP
  child_name := parent_name||'_'||to_char(month_start,'YYYYMM');
  IF to_regclass(format('public.%I',child_name)) IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=to_regclass(format('public.%I',child_name)) AND inhparent=to_regclass(format('public.%I',parent_name))) THEN
    RAISE EXCEPTION 'Evidence partition name is already in use';
   END IF;
   CONTINUE;
  END IF;
  EXECUTE format('CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',child_name,parent_name,month_start::timestamp AT TIME ZONE 'UTC',month_end::timestamp AT TIME ZONE 'UTC');
  predicate := CASE WHEN parent_name='query_run'
    THEN 'project_id=NULLIF(current_setting(''app.project_id'',true),'''')::uuid'
    ELSE format('EXISTS (SELECT 1 FROM public.query_run r WHERE r.id=%I.run_id AND r.started_at=%I.started_at)',child_name,child_name) END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',child_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',child_name);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT USING (%s)',child_name,predicate);
  EXECUTE format('CREATE POLICY tenant_write ON public.%I FOR INSERT WITH CHECK (%s)',child_name,predicate);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin',child_name);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO opintel_app,opintel_platform_admin',child_name);
  EXECUTE format('GRANT TRUNCATE ON public.%I TO opintel_platform_admin',child_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.ensure_evidence_month(date) FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin;
-- Bootstrap adjacent UTC months; deployment owners provision subsequent months
-- with ensure_evidence_month. Missing partitions fail closed; no default bucket.
SELECT public.ensure_evidence_month((date_trunc('month',now() AT TIME ZONE 'UTC')+n*interval '1 month')::date) FROM generate_series(-1,1) AS n;
