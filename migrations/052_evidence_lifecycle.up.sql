-- 5.17: only narrow owner commands may redact or age evidence. App grants stay append-only.
ALTER TABLE query_run ALTER COLUMN request DROP NOT NULL;
ALTER TABLE query_run ADD COLUMN capture_percent numeric NOT NULL DEFAULT 100 CHECK(capture_percent>0 AND capture_percent<=100);
ALTER TABLE query_run ADD COLUMN capture_selected boolean NOT NULL DEFAULT true;
ALTER TABLE run_completion ADD COLUMN detail_captured boolean NOT NULL DEFAULT true;
ALTER TABLE run_completion ADD CONSTRAINT evidence_failure_detail CHECK(detail_captured OR outcome->>'kind' IN ('answered','reduced'));
CREATE TABLE evidence_redaction (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES project(id),
 run_id uuid NOT NULL, started_at timestamptz NOT NULL, redacted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 policy jsonb NOT NULL, fields text[] NOT NULL,
 FOREIGN KEY(run_id,started_at) REFERENCES query_run(id,started_at)
);
CREATE INDEX evidence_redaction_run ON evidence_redaction(run_id,started_at);
CREATE TABLE evidence_rollup (
 id uuid NOT NULL, started_at timestamptz NOT NULL, project_id uuid NOT NULL REFERENCES project(id),
 pool_id uuid NOT NULL, agent_id text, key_prefix text NOT NULL, mode text NOT NULL,
 versions jsonb NOT NULL, outcome jsonb NOT NULL, token_key_version_used integer,
 latency_ms integer, synthetic boolean NOT NULL, completed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), minimum_retention_days integer NOT NULL CHECK(minimum_retention_days BETWEEN 1 AND 36500),
 capture_percent numeric NOT NULL, capture_selected boolean NOT NULL, detail_captured boolean NOT NULL,
 redactions jsonb NOT NULL, treatment_counts jsonb NOT NULL, source_treatment_counts jsonb NOT NULL,
 PRIMARY KEY(id,started_at), FOREIGN KEY(pool_id,project_id) REFERENCES pool(id,project_id)
);
CREATE INDEX evidence_rollup_project_time ON evidence_rollup(project_id,started_at DESC,id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['evidence_redaction','evidence_rollup'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING(project_id=NULLIF(current_setting(''app.project_id'',true),'''')::uuid)',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin',t);
  EXECUTE format('GRANT SELECT ON %I TO opintel_app',t);
  EXECUTE format('GRANT TRUNCATE ON %I TO opintel_platform_admin',t);
 END LOOP;
END $$;
CREATE POLICY tenant_write ON evidence_redaction FOR INSERT WITH CHECK(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid AND EXISTS(SELECT 1 FROM query_run r WHERE r.id=run_id AND r.started_at=evidence_redaction.started_at));
GRANT INSERT ON evidence_redaction TO opintel_app;
-- Required tenant policy name, with an explicit denial: only maintenance creates rollups.
CREATE POLICY tenant_write ON evidence_rollup FOR INSERT WITH CHECK(false);

-- Invoker views retain the caller's RLS for both original and rolled-up runs.
CREATE VIEW evidence_run_read WITH(security_invoker=true) AS
 SELECT r.*, 'full'::text AS record_kind,NULL::timestamptz AS rolled_up_at,'{}'::jsonb AS treatment_counts,'{}'::jsonb AS source_treatment_counts,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('at',e.redacted_at,'policy',e.policy,'fields',e.fields) ORDER BY e.redacted_at,e.id) FROM evidence_redaction e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]'::jsonb) AS redactions
 FROM query_run r
 UNION ALL
 SELECT id,project_id,pool_id,agent_id,key_prefix,mode,NULL::text,versions,started_at,capture_percent,capture_selected,'rollup',created_at,treatment_counts,source_treatment_counts,redactions FROM evidence_rollup;
CREATE VIEW evidence_completion_read WITH(security_invoker=true) AS
 SELECT run_id,started_at,outcome,cil,source_plan,generated_sql,latency_ms,freshness,synthetic,completed_at,token_key_version_used,detail_captured FROM run_completion
 UNION ALL
 SELECT id,started_at,outcome,NULL::jsonb,NULL::jsonb,NULL::text,latency_ms,'{}'::jsonb,synthetic,completed_at,token_key_version_used,detail_captured FROM evidence_rollup;
GRANT SELECT ON evidence_run_read,evidence_completion_read TO opintel_app;

CREATE FUNCTION provision_evidence_partitions() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE n integer; BEGIN
 FOR n IN -1..3 LOOP
  PERFORM public.ensure_evidence_month((date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')+n*interval '1 month')::date);
 END LOOP;
END $$;

CREATE FUNCTION evidence_redaction_batch(p_project uuid,p_after_time timestamptz,p_after_id uuid,p_limit integer)
RETURNS TABLE(id uuid,started_at text,mode text,request text,generated_sql text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT r.id,r.started_at::text,r.mode,r.request,c.generated_sql FROM public.query_run r LEFT JOIN public.run_completion c ON c.run_id=r.id AND c.started_at=r.started_at
 WHERE r.project_id=p_project AND (p_after_time IS NULL OR (r.started_at,r.id)>(p_after_time,p_after_id))
 ORDER BY r.started_at,r.id LIMIT LEAST(GREATEST(p_limit,1),100);
$$;
CREATE FUNCTION redact_evidence_arguments(p_project uuid,p_id uuid,p_at timestamptz,p_old_request text,p_old_sql text,p_request text,p_sql text,p_policy jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r public.query_run; c public.run_completion; policy_now jsonb; changed text[]:='{}'; BEGIN
 SELECT jsonb_build_object('redaction',COALESCE(settings#>>'{evidence,redaction}','aggressive'),'allowlistedFields',COALESCE(settings#>'{evidence,allowlistedFields}','[]'::jsonb)) INTO policy_now FROM public.project WHERE id=p_project FOR SHARE;
 IF policy_now IS DISTINCT FROM p_policy OR p_policy->>'redaction'='none' THEN RETURN false; END IF;
 SELECT * INTO r FROM public.query_run WHERE project_id=p_project AND id=p_id AND started_at=p_at FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO c FROM public.run_completion WHERE run_id=p_id AND started_at=p_at FOR UPDATE;
 IF r.request IS DISTINCT FROM p_old_request OR c.generated_sql IS DISTINCT FROM p_old_sql THEN RETURN false; END IF;
 -- No restoration: null arguments stay absent. Only the maintenance role can call.
 IF r.request IS NOT NULL AND r.request IS DISTINCT FROM p_request THEN
  UPDATE public.query_run SET request=p_request WHERE id=p_id AND started_at=p_at; changed:=array_append(changed,'request');
 END IF;
 IF c.generated_sql IS NOT NULL AND c.generated_sql IS DISTINCT FROM p_sql THEN
  UPDATE public.run_completion SET generated_sql=p_sql WHERE run_id=p_id AND started_at=p_at; changed:=array_append(changed,'generatedSql');
 END IF;
 IF cardinality(changed)>0 THEN INSERT INTO public.evidence_redaction(project_id,run_id,started_at,policy,fields) VALUES(p_project,p_id,p_at,p_policy,changed); END IF;
 RETURN cardinality(changed)>0;
END $$;

-- Exactly one run aggregate per invocation/transaction, including expiry.
CREATE FUNCTION retain_evidence(p_project uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE settings_value jsonb; full_days integer; rollup_days integer; r public.query_run; aged_count integer:=0; expired_count integer:=0; BEGIN
 SELECT settings INTO settings_value FROM public.project WHERE id=p_project FOR SHARE;
 -- Validate before casting; absent/invalid retention never authorises destruction.
 IF jsonb_typeof(settings_value#>'{evidence,fullRetentionDays}')='number' AND (settings_value#>>'{evidence,fullRetentionDays}') ~ '^[0-9]+$' AND (settings_value#>>'{evidence,fullRetentionDays}')::numeric BETWEEN 1 AND 36500 THEN full_days:=(settings_value#>>'{evidence,fullRetentionDays}')::integer; END IF;
 IF jsonb_typeof(settings_value#>'{evidence,rollupRetentionDays}')='number' AND (settings_value#>>'{evidence,rollupRetentionDays}') ~ '^[0-9]+$' AND (settings_value#>>'{evidence,rollupRetentionDays}')::numeric BETWEEN 1 AND 36500 THEN rollup_days:=(settings_value#>>'{evidence,rollupRetentionDays}')::integer; END IF;
 IF full_days IS NOT NULL AND rollup_days IS NOT NULL AND rollup_days<full_days THEN RETURN 0; END IF;
 IF rollup_days IS NOT NULL THEN
  DELETE FROM public.evidence_rollup x WHERE (x.id,x.started_at) IN (
   SELECT id,started_at FROM public.evidence_rollup WHERE project_id=p_project AND created_at<clock_timestamp()-make_interval(days=>GREATEST(rollup_days,COALESCE(full_days,0),minimum_retention_days)) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS expired_count=ROW_COUNT;
  IF expired_count>0 THEN RETURN expired_count; END IF;
 END IF;
 IF full_days IS NULL THEN RETURN expired_count; END IF;
 FOR r IN SELECT q.* FROM public.query_run q WHERE q.project_id=p_project AND q.started_at<clock_timestamp()-make_interval(days=>full_days) AND EXISTS(SELECT 1 FROM public.run_completion c WHERE c.run_id=q.id AND c.started_at=q.started_at) ORDER BY q.started_at,q.id LIMIT 1 FOR UPDATE SKIP LOCKED LOOP
  INSERT INTO public.evidence_rollup(id,started_at,project_id,pool_id,agent_id,key_prefix,mode,versions,outcome,token_key_version_used,latency_ms,synthetic,completed_at,minimum_retention_days,capture_percent,capture_selected,detail_captured,redactions,treatment_counts,source_treatment_counts)
  SELECT r.id,r.started_at,r.project_id,r.pool_id,r.agent_id,r.key_prefix,r.mode,r.versions,c.outcome,c.token_key_version_used,c.latency_ms,c.synthetic,c.completed_at,GREATEST(full_days,COALESCE(rollup_days,full_days)),r.capture_percent,r.capture_selected,c.detail_captured,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('at',e.redacted_at,'policy',e.policy,'fields',e.fields) ORDER BY e.redacted_at,e.id) FROM public.evidence_redaction e WHERE e.run_id=r.id AND e.started_at=r.started_at),'[]'),
   COALESCE((SELECT jsonb_object_agg(counts.k,counts.n) FROM (SELECT COALESCE(treatment,state) k,count(*) n FROM public.run_element WHERE run_id=r.id AND started_at=r.started_at GROUP BY 1) counts),'{}'),
   COALESCE((SELECT jsonb_object_agg(counts.k,counts.n) FROM (SELECT COALESCE(treatment,state) k,count(*) n FROM public.run_element WHERE run_id=r.id AND started_at=r.started_at AND element_id IS NOT NULL GROUP BY 1) counts),'{}')
  FROM public.run_completion c WHERE c.run_id=r.id AND c.started_at=r.started_at;
  DELETE FROM public.evidence_redaction WHERE run_id=r.id AND started_at=r.started_at;
  DELETE FROM public.run_stage WHERE run_id=r.id AND started_at=r.started_at;
  DELETE FROM public.run_element WHERE run_id=r.id AND started_at=r.started_at;
  DELETE FROM public.run_completion WHERE run_id=r.id AND started_at=r.started_at;
  DELETE FROM public.query_run WHERE id=r.id AND started_at=r.started_at;
  aged_count:=aged_count+1;
 END LOOP;
 RETURN aged_count+expired_count;
END $$;
REVOKE ALL ON FUNCTION provision_evidence_partitions(),evidence_redaction_batch(uuid,timestamptz,uuid,integer),redact_evidence_arguments(uuid,uuid,timestamptz,text,text,text,text,jsonb),retain_evidence(uuid) FROM PUBLIC,opintel_app,opintel_platform;
GRANT EXECUTE ON FUNCTION provision_evidence_partitions(),evidence_redaction_batch(uuid,timestamptz,uuid,integer),redact_evidence_arguments(uuid,uuid,timestamptz,text,text,text,text,jsonb),retain_evidence(uuid) TO opintel_platform_admin;
SELECT provision_evidence_partitions();
