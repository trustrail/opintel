DROP INDEX catalog_element_tree;
DROP INDEX catalog_object_tree;
DROP TRIGGER source_alias_immutable ON data_source;
DROP FUNCTION guard_source_alias();
ALTER TABLE data_source DROP COLUMN duckdb_alias;
