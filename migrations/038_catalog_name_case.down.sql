DROP INDEX catalog_element_exposed_name_unique;
DROP INDEX catalog_object_exposed_address_unique;
ALTER TABLE catalog_element
  DROP CONSTRAINT catalog_element_exposed_name_lowercase,
  ADD CONSTRAINT catalog_element_object_id_duckdb_name_key UNIQUE(object_id, exposed_name);
ALTER TABLE catalog_object
  DROP CONSTRAINT catalog_object_exposed_schema_lowercase,
  DROP CONSTRAINT catalog_object_exposed_name_lowercase,
  ADD CONSTRAINT catalog_object_source_id_duckdb_schema_duckdb_name_key UNIQUE(source_id, exposed_schema, exposed_name);
