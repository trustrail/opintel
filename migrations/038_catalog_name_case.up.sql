-- Do not silently rename an exposed namespace. Lock writers while auditing;
-- an incompatible existing row aborts this entire forward migration.
LOCK TABLE catalog_element, catalog_object IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE invalid_ids text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO invalid_ids
  FROM catalog_element WHERE exposed_name IS DISTINCT FROM lower(exposed_name);
  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Catalogue lowercase migration refused: catalog_element ids %', invalid_ids;
  END IF;
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO invalid_ids
  FROM catalog_object WHERE exposed_schema IS DISTINCT FROM lower(exposed_schema)
    OR exposed_name IS DISTINCT FROM lower(exposed_name);
  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Catalogue lowercase migration refused: catalog_object ids %', invalid_ids;
  END IF;
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO invalid_ids
  FROM (SELECT id, count(*) OVER (PARTITION BY object_id, lower(exposed_name)) AS n
    FROM catalog_element WHERE exposed_name IS NOT NULL) collisions WHERE n > 1;
  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Catalogue case-insensitive uniqueness migration refused: catalog_element ids %', invalid_ids;
  END IF;
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO invalid_ids
  FROM (SELECT id, count(*) OVER (PARTITION BY source_id, lower(exposed_schema), lower(exposed_name)) AS n
    FROM catalog_object) collisions WHERE n > 1;
  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Catalogue case-insensitive uniqueness migration refused: catalog_object ids %', invalid_ids;
  END IF;
END $$;
ALTER TABLE catalog_element ADD CONSTRAINT catalog_element_exposed_name_lowercase CHECK (exposed_name = lower(exposed_name));
ALTER TABLE catalog_object
  ADD CONSTRAINT catalog_object_exposed_schema_lowercase CHECK (exposed_schema = lower(exposed_schema)),
  ADD CONSTRAINT catalog_object_exposed_name_lowercase CHECK (exposed_name = lower(exposed_name));
ALTER TABLE catalog_element DROP CONSTRAINT catalog_element_object_id_duckdb_name_key;
ALTER TABLE catalog_object DROP CONSTRAINT catalog_object_source_id_duckdb_schema_duckdb_name_key;
CREATE UNIQUE INDEX catalog_element_exposed_name_unique ON catalog_element(object_id, lower(exposed_name));
CREATE UNIQUE INDEX catalog_object_exposed_address_unique ON catalog_object(source_id, lower(exposed_schema), lower(exposed_name));
