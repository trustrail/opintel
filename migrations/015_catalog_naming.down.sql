-- Refuse rollback if it would require inventing names/types for new rows.
ALTER TABLE catalog_element ALTER COLUMN duckdb_name SET NOT NULL;
ALTER TABLE catalog_element ALTER COLUMN duckdb_type SET NOT NULL;
CREATE OR REPLACE FUNCTION preserve_catalog_duckdb_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duckdb_name IS DISTINCT FROM OLD.duckdb_name THEN
    RAISE EXCEPTION 'An exposed catalogue name cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE FUNCTION preserve_catalog_duckdb_schema() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duckdb_schema IS DISTINCT FROM OLD.duckdb_schema THEN
    RAISE EXCEPTION 'An exposed catalogue schema cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER catalog_object_immutable_schema BEFORE UPDATE ON catalog_object
  FOR EACH ROW EXECUTE FUNCTION preserve_catalog_duckdb_schema();
ALTER TABLE catalog_object DROP COLUMN name_revision;
ALTER TABLE catalog_element DROP COLUMN name_revision;
