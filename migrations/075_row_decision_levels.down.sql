DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM row_entitlement WHERE level<>'pool_override') THEN
  RAISE EXCEPTION 'Cannot downgrade while object default or tag rule history exists';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.bind_row_entitlement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM id FROM public.catalog_object WHERE id=NEW.object_id AND project_id=NEW.project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Row decision object must belong to its project'; END IF;
 SELECT exposed_name INTO NEW.object_name FROM public.catalog_object WHERE id=NEW.object_id;
 NEW.actor_id:=NULLIF(current_setting('app.user_id',true),'')::uuid;
 NEW.first_scoping:=NOT EXISTS(SELECT 1 FROM public.row_entitlement WHERE object_id=NEW.object_id);
 RETURN NEW;
END $$;
DROP INDEX row_entitlement_default;
ALTER TABLE row_entitlement DROP CONSTRAINT row_entitlement_target;
ALTER TABLE row_entitlement DROP COLUMN level, DROP COLUMN tag_domain, DROP COLUMN tag_name;
ALTER TABLE row_entitlement ALTER COLUMN pool_id SET NOT NULL;
ALTER TABLE row_entitlement ALTER COLUMN object_id SET NOT NULL;
