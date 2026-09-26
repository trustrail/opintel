-- Tenant callers may enqueue only their own pool/source edges, not arbitrary
-- human memberships. The relationship outbox remains platform-owned.
CREATE FUNCTION public.enqueue_pool_binding(p_pool uuid,p_source uuid,p_bound boolean)
RETURNS TABLE(id bigint) LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE tenant uuid := NULLIF(current_setting('app.project_id',true),'')::uuid;
BEGIN
 IF tenant IS NULL OR NOT EXISTS(SELECT 1 FROM public.pool WHERE pool.id=p_pool AND project_id=tenant)
 OR NOT EXISTS(SELECT 1 FROM public.data_source WHERE data_source.id=p_source AND project_id=tenant) THEN
  RAISE EXCEPTION 'Pool and source must belong to the active project' USING ERRCODE='42501';
 END IF;
 IF p_bound IS NULL OR p_bound<>EXISTS(SELECT 1 FROM public.pool_source_binding WHERE pool_id=p_pool AND source_id=p_source AND project_id=tenant) THEN
  RAISE EXCEPTION 'The relationship must match the committed binding decision' USING ERRCODE='23514';
 END IF;
 IF p_bound THEN
  RETURN QUERY INSERT INTO public.relationship_outbox(operation,resource_type,resource_id,relation,subject_type,subject_id)
   VALUES('touch','pool',p_pool::text,'project','project',tenant::text),
         ('touch','datasource',p_source::text,'project','project',tenant::text) RETURNING relationship_outbox.id;
 END IF;
 RETURN QUERY INSERT INTO public.relationship_outbox(operation,resource_type,resource_id,relation,subject_type,subject_id)
  VALUES(CASE WHEN p_bound THEN 'touch' ELSE 'delete' END,'datasource',p_source::text,'bound_pool','pool',p_pool::text) RETURNING relationship_outbox.id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_pool_binding(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_pool_binding(uuid,uuid,boolean) TO opintel_app;
