-- Existing immutable decisions become pool overrides without changing identity.
-- Reserve tag-rule storage now; tag-rule evaluation is a later item.
ALTER TABLE row_entitlement ALTER COLUMN pool_id DROP NOT NULL;
ALTER TABLE row_entitlement ALTER COLUMN object_id DROP NOT NULL;
ALTER TABLE row_entitlement ADD COLUMN level text NOT NULL DEFAULT 'pool_override';
ALTER TABLE row_entitlement ADD COLUMN tag_domain text;
ALTER TABLE row_entitlement ADD COLUMN tag_name text;
ALTER TABLE row_entitlement ADD CONSTRAINT row_entitlement_target CHECK (
 (level='pool_override' AND object_id IS NOT NULL AND pool_id IS NOT NULL AND tag_domain IS NULL AND tag_name IS NULL) OR
 (level='object_default' AND object_id IS NOT NULL AND pool_id IS NULL AND tag_domain IS NULL AND tag_name IS NULL) OR
 (level='tag_rule' AND object_id IS NULL AND pool_id IS NULL AND tag_domain IS NOT NULL AND tag_name IS NOT NULL)
);
CREATE INDEX row_entitlement_default ON row_entitlement(object_id,sequence DESC) WHERE level='object_default';
CREATE OR REPLACE FUNCTION public.bind_row_entitlement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.level='tag_rule' THEN RAISE EXCEPTION 'Tag rules are reserved for a later item'; END IF;
 PERFORM id FROM public.catalog_object WHERE id=NEW.object_id AND project_id=NEW.project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Row decision object must belong to its project'; END IF;
 SELECT exposed_name INTO NEW.object_name FROM public.catalog_object WHERE id=NEW.object_id;
 NEW.actor_id:=NULLIF(current_setting('app.user_id',true),'')::uuid;
 NEW.first_scoping:=NOT EXISTS(SELECT 1 FROM public.row_entitlement WHERE object_id=NEW.object_id);
 RETURN NEW;
END $$;
