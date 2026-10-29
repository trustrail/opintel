DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pool WHERE tables_explicit) THEN
  RAISE EXCEPTION 'Cannot downgrade explicit table selection into source-wide access';
 END IF;
END $$;
DROP TABLE pool_table_binding;
DROP FUNCTION public.pool_table_allowed(uuid,uuid);
ALTER TABLE catalog_object DROP CONSTRAINT catalog_object_project_identity;
ALTER TABLE pool DROP COLUMN table_setup;
ALTER TABLE pool DROP COLUMN tables_explicit;
