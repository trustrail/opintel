ALTER TABLE public.project ADD COLUMN first_receipt_at timestamptz;
UPDATE public.project p SET first_receipt_at=(SELECT min(r.started_at) FROM public.evidence_run_read r WHERE r.project_id=p.id);
CREATE FUNCTION public.remember_first_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE public.project SET first_receipt_at=NEW.started_at WHERE id=NEW.project_id AND first_receipt_at IS NULL;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.remember_first_receipt() FROM PUBLIC;
CREATE TRIGGER remember_first_receipt AFTER INSERT ON public.query_run FOR EACH ROW EXECUTE FUNCTION public.remember_first_receipt();
CREATE FUNCTION public.protect_first_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.first_receipt_at IS DISTINCT FROM OLD.first_receipt_at
  AND (OLD.first_receipt_at IS NOT NULL OR pg_trigger_depth()<2) THEN
  RAISE EXCEPTION 'The first receipt timestamp is read-only';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_first_receipt() FROM PUBLIC;
CREATE TRIGGER protect_first_receipt BEFORE UPDATE OF first_receipt_at ON public.project FOR EACH ROW EXECUTE FUNCTION public.protect_first_receipt();
