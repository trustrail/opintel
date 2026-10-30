-- Narrow installation-to-new-project orchestration. No fleet-wide table grant.
CREATE FUNCTION public.first_run_paired_engines(p_company uuid,p_actor uuid,p_project uuid,p_candidates jsonb,p_selected text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE available jsonb; chosen jsonb; registered jsonb:=NULL; engine_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.company_member WHERE company_id=p_company AND user_id=p_actor AND role='admin') THEN
  RAISE EXCEPTION 'Company administrator required' USING ERRCODE='42501';
 END IF;
 IF p_project IS NOT NULL THEN
  -- A caller cannot attach silently to a project from any earlier transaction.
  IF NOT EXISTS(SELECT 1 FROM public.project p JOIN public.project_member m ON m.project_id=p.id
   WHERE p.id=p_project AND p.company_id=p_company AND m.user_id=p_actor AND m.role='admin'
   AND p.xmin::text::bigint=mod(txid_current(),4294967296)) THEN
   RAISE EXCEPTION 'A newly created project is required' USING ERRCODE='22023';
  END IF;
  LOCK TABLE public.engine IN SHARE ROW EXCLUSIVE MODE;
 END IF;
 SELECT COALESCE(jsonb_agg(c),'[]'::jsonb) INTO available FROM jsonb_array_elements(p_candidates) c
 WHERE NOT EXISTS(SELECT 1 FROM public.engine e WHERE e.certificate_pin=c->>'certificatePin' OR e.address=c->>'address');
 IF p_project IS NOT NULL THEN
  IF p_selected IS NOT NULL THEN
   SELECT c INTO chosen FROM jsonb_array_elements(available) c WHERE c->>'id'=p_selected;
   IF chosen IS NULL THEN RAISE EXCEPTION 'The paired engine is no longer available' USING ERRCODE='22023'; END IF;
  ELSIF jsonb_array_length(available)=1 THEN chosen:=available->0;
  END IF;
  IF chosen IS NOT NULL THEN
   engine_id:=gen_random_uuid();
   INSERT INTO public.engine(id,project_id,name,address,certificate_pin)
    VALUES(engine_id,p_project,chosen->>'name',chosen->>'address',chosen->>'certificatePin');
   registered:=jsonb_build_object('id',engine_id,'name',chosen->>'name');
  END IF;
 END IF;
 RETURN jsonb_build_object('registered',registered,'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c->>'id','name',c->>'name')) FROM jsonb_array_elements(available) c),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.first_run_paired_engines(uuid,uuid,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.first_run_paired_engines(uuid,uuid,uuid,jsonb,text) TO opintel_platform;
