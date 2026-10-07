-- Read-only finding lifecycle, not an acknowledge/resolve workflow. Store only
-- whitelisted metadata; arrival payloads, filenames, reasons and key material
-- are deliberately absent. Database-owned triggers capture authoritative facts.
CREATE TABLE observation_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('filing','type','custody')),
 cause text NOT NULL, cause_detail text NOT NULL DEFAULT '', entity_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('open','resolved')),
 observed_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolution text, metadata jsonb NOT NULL,
 CHECK((state='resolved')=(resolution IS NOT NULL))
);
CREATE INDEX observation_event_group ON observation_event(project_id,kind,cause,cause_detail,entity_id,id DESC);
ALTER TABLE observation_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON observation_event FOR SELECT TO opintel_app USING(project_id=NULLIF(current_setting('app.project_id',true),'')::uuid);
-- Explicit denial documents trigger-only writes; absence of a policy is not an
-- invitation to add tenant inserts later. Matches evidence_rollup's convention.
CREATE POLICY tenant_write ON observation_event FOR INSERT TO opintel_app WITH CHECK(false);
GRANT SELECT ON observation_event TO opintel_app;
GRANT TRUNCATE ON observation_event TO opintel_platform_admin;

CREATE FUNCTION public.record_filing_observation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE detail jsonb; prior record; category text;
BEGIN
 SELECT jsonb_build_object('filingId',NEW.filing_id,'zoneId',NEW.source_id,'sourceName',s.name,'engineId',s.engine_id,'engineName',e.name) INTO detail
 FROM public.data_source s LEFT JOIN public.engine e ON e.id=s.engine_id WHERE s.id=NEW.source_id;
 category:=NEW.payload->>'quarantineCategory';
 FOR prior IN SELECT DISTINCT ON (cause) * FROM public.observation_event WHERE project_id=NEW.project_id AND kind='filing' AND entity_id=NEW.filing_id::text ORDER BY cause,id DESC LOOP
  IF prior.state='open' AND NEW.payload->>'outcome'='landed' THEN
   INSERT INTO public.observation_event(project_id,kind,cause,entity_id,state,observed_at,resolution,metadata)
   VALUES(NEW.project_id,'filing',prior.cause,prior.entity_id,'resolved',clock_timestamp(),'landed',prior.metadata);
  END IF;
 END LOOP;
 IF NEW.payload->>'outcome'='quarantined' THEN
  INSERT INTO public.observation_event(project_id,kind,cause,entity_id,state,observed_at,metadata)
  VALUES(NEW.project_id,'filing',COALESCE(category,'attribution_missing'),NEW.filing_id::text,'open',(NEW.payload->>'receivedAt')::timestamptz,detail);
  INSERT INTO public.observation_event(project_id,kind,cause,entity_id,state,observed_at,resolution,metadata)
  SELECT NEW.project_id,'filing',COALESCE(category,'attribution_missing'),NEW.filing_id::text,'resolved',(r.payload->>'landedAt')::timestamptz,'landed',detail FROM public.landing_receipt r WHERE r.filing_id=NEW.filing_id AND r.project_id=NEW.project_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_filing_observation() FROM PUBLIC;
CREATE TRIGGER filing_observation AFTER INSERT OR UPDATE OF revision ON arrival_notice FOR EACH ROW EXECUTE FUNCTION public.record_filing_observation();

CREATE FUNCTION public.resolve_landed_observations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior record;
BEGIN
 FOR prior IN SELECT DISTINCT ON (cause) * FROM public.observation_event WHERE project_id=NEW.project_id AND kind='filing' AND entity_id=NEW.filing_id::text ORDER BY cause,id DESC LOOP
  IF prior.state='open' THEN
   INSERT INTO public.observation_event(project_id,kind,cause,entity_id,state,observed_at,resolution,metadata)
   VALUES(NEW.project_id,'filing',prior.cause,prior.entity_id,'resolved',(NEW.payload->>'landedAt')::timestamptz,'landed',prior.metadata);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.resolve_landed_observations() FROM PUBLIC;
CREATE TRIGGER landed_observations AFTER INSERT ON landing_receipt FOR EACH ROW EXECUTE FUNCTION public.resolve_landed_observations();

CREATE FUNCTION public.record_type_observations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE finding jsonb; prior record; detail jsonb; repaired text;
BEGIN
 IF NEW.state<>'complete' OR (TG_OP='UPDATE' AND OLD.state='complete') THEN RETURN NEW; END IF;
 FOR finding IN SELECT value FROM jsonb_array_elements(NEW.diff) WHERE value->>'type'='CatalogElementUnsupported' AND value->>'unsupportedReason'='unmapped' LOOP
  SELECT jsonb_build_object('elementId',e.id,'sourceId',s.id,'sourceName',s.name,'object',o.exposed_name,'column',e.exposed_name,'sourceType',finding->>'sourceType','runId',NEW.id) INTO detail
  FROM public.catalog_element e JOIN public.catalog_object o ON o.id=e.object_id JOIN public.data_source s ON s.id=o.source_id WHERE e.id=(finding->>'elementId')::uuid AND e.project_id=NEW.project_id AND o.source_id=NEW.source_id;
  IF detail IS NOT NULL THEN
   INSERT INTO public.observation_event(project_id,kind,cause,cause_detail,entity_id,state,observed_at,metadata)
   VALUES(NEW.project_id,'type','unmapped',finding->>'sourceType',finding->>'elementId','open',NEW.ended_at,detail);
  END IF;
 END LOOP;
 FOR prior IN SELECT DISTINCT ON (cause_detail,entity_id) * FROM public.observation_event WHERE project_id=NEW.project_id AND kind='type' AND metadata->>'sourceId'=NEW.source_id::text ORDER BY cause_detail,entity_id,id DESC LOOP
  IF prior.state<>'open' THEN CONTINUE; END IF;
  SELECT CASE WHEN e.status<>'active' OR o.status<>'active' THEN 'removed' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.diff) x WHERE x->>'elementId'=e.id::text AND x->>'type'='CatalogElementUnsupported' AND x->>'unsupportedReason'='explicitly_excluded') THEN 'explicitly_excluded' WHEN e.source_type IS DISTINCT FROM prior.cause_detail THEN 'source_type_changed' WHEN e.exposed_type IS NOT NULL THEN 'mapping_repaired' END INTO repaired
  FROM public.catalog_element e JOIN public.catalog_object o ON o.id=e.object_id WHERE e.id=prior.entity_id::uuid;
  IF repaired IS NOT NULL THEN
   INSERT INTO public.observation_event(project_id,kind,cause,cause_detail,entity_id,state,observed_at,resolution,metadata)
   VALUES(NEW.project_id,'type',prior.cause,prior.cause_detail,prior.entity_id,'resolved',NEW.ended_at,repaired,prior.metadata||jsonb_build_object('resolutionRunId',NEW.id));
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_type_observations() FROM PUBLIC;
CREATE TRIGGER type_observations AFTER INSERT OR UPDATE OF state ON introspection_run FOR EACH ROW EXECUTE FUNCTION public.record_type_observations();

CREATE FUNCTION public.record_custody_observation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior record; category text;
BEGIN
 IF NEW.last_rehearsal IS NULL THEN RETURN NEW; END IF;
 category:='custody_'||NEW.last_rehearsal;
 FOR prior IN SELECT DISTINCT ON (cause) * FROM public.observation_event WHERE project_id=NEW.project_id AND kind='custody' AND entity_id=NEW.version::text ORDER BY cause,id DESC LOOP
  IF prior.state='open' AND prior.cause<>category THEN
   INSERT INTO public.observation_event(project_id,kind,cause,entity_id,state,observed_at,resolution,metadata)
   VALUES(NEW.project_id,'custody',prior.cause,prior.entity_id,'resolved',NEW.last_rehearsed_at,CASE WHEN NEW.last_rehearsal='ok' THEN 'backup_verified' ELSE 'cause_changed' END,prior.metadata);
  END IF;
 END LOOP;
 IF NEW.last_rehearsal IN ('failed','mismatch') THEN
  INSERT INTO public.observation_event(project_id,kind,cause,entity_id,state,observed_at,metadata)
  VALUES(NEW.project_id,'custody',category,NEW.version::text,'open',NEW.last_rehearsed_at,jsonb_build_object('keyVersion',NEW.version));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_custody_observation() FROM PUBLIC;
CREATE TRIGGER custody_observation AFTER INSERT OR UPDATE OF last_rehearsed_at ON token_key_version FOR EACH ROW EXECUTE FUNCTION public.record_custody_observation();

CREATE FUNCTION public.archive_type_observations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior record;
BEGIN
 IF NEW.status<>'archived' OR OLD.status='archived' THEN RETURN NEW; END IF;
 FOR prior IN SELECT DISTINCT ON (cause_detail,entity_id) * FROM public.observation_event WHERE project_id=NEW.project_id AND kind='type' AND metadata->>'sourceId'=NEW.id::text ORDER BY cause_detail,entity_id,id DESC LOOP
  IF prior.state='open' THEN
   INSERT INTO public.observation_event(project_id,kind,cause,cause_detail,entity_id,state,observed_at,resolution,metadata)
   VALUES(NEW.project_id,'type',prior.cause,prior.cause_detail,prior.entity_id,'resolved',clock_timestamp(),'source_archived',prior.metadata);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.archive_type_observations() FROM PUBLIC;
CREATE TRIGGER archive_type_observations AFTER UPDATE OF status ON data_source FOR EACH ROW EXECUTE FUNCTION public.archive_type_observations();

-- Baseline: previous quarantine revisions and custody outcomes cannot be
-- reconstructed from overwritten projections. Do not invent them. Existing
-- current failures and durable introspection findings can be retained safely.
INSERT INTO observation_event(project_id,kind,cause,entity_id,state,observed_at,metadata)
 SELECT a.project_id,'filing',COALESCE(a.payload->>'quarantineCategory','attribution_missing'),a.filing_id::text,'open',(a.payload->>'receivedAt')::timestamptz,
 jsonb_build_object('filingId',a.filing_id,'zoneId',a.source_id,'sourceName',s.name,'engineId',s.engine_id,'engineName',e.name)
 FROM arrival_notice a JOIN data_source s ON s.id=a.source_id LEFT JOIN engine e ON e.id=s.engine_id WHERE a.payload->>'outcome'='quarantined';
INSERT INTO observation_event(project_id,kind,cause,entity_id,state,observed_at,resolution,metadata)
 SELECT h.project_id,h.kind,h.cause,h.entity_id,'resolved',(r.payload->>'landedAt')::timestamptz,'landed',h.metadata FROM observation_event h JOIN landing_receipt r ON r.filing_id=h.entity_id::uuid AND r.project_id=h.project_id WHERE h.kind='filing' AND h.state='open';
INSERT INTO observation_event(project_id,kind,cause,cause_detail,entity_id,state,observed_at,metadata)
 SELECT r.project_id,'type','unmapped',d->>'sourceType',d->>'elementId','open',r.ended_at,
 jsonb_build_object('elementId',d->>'elementId','sourceId',s.id,'sourceName',s.name,'object',o.exposed_name,'column',e.exposed_name,'sourceType',d->>'sourceType','runId',r.id)
 FROM introspection_run r CROSS JOIN LATERAL jsonb_array_elements(r.diff) d JOIN catalog_element e ON e.id=(d->>'elementId')::uuid JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
 WHERE r.state='complete' AND d->>'type'='CatalogElementUnsupported' AND d->>'unsupportedReason'='unmapped' ORDER BY r.ended_at,r.id;
INSERT INTO observation_event(project_id,kind,cause,cause_detail,entity_id,state,observed_at,resolution,metadata)
 SELECT v.project_id,v.kind,v.cause,v.cause_detail,v.entity_id,'resolved',COALESCE(s.last_introspected_at,clock_timestamp()),
 CASE WHEN s.status='archived' THEN 'source_archived' WHEN e.status<>'active' OR o.status<>'active' THEN 'removed' WHEN e.source_type<>v.cause_detail THEN 'source_type_changed' ELSE 'mapping_repaired' END,v.metadata
 FROM (SELECT DISTINCT ON(project_id,cause_detail,entity_id) * FROM observation_event WHERE kind='type' ORDER BY project_id,cause_detail,entity_id,id DESC)v
 JOIN catalog_element e ON e.id=v.entity_id::uuid JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
 WHERE s.status='archived' OR e.status<>'active' OR o.status<>'active' OR e.source_type<>v.cause_detail OR e.exposed_type IS NOT NULL;
INSERT INTO observation_event(project_id,kind,cause,entity_id,state,observed_at,metadata)
 SELECT project_id,'custody','custody_'||last_rehearsal,version::text,'open',last_rehearsed_at,jsonb_build_object('keyVersion',version) FROM token_key_version WHERE last_rehearsal IN ('failed','mismatch');
