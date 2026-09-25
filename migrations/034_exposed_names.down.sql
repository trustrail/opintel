ALTER TABLE data_source RENAME COLUMN exposed_alias TO duckdb_alias;
ALTER TABLE catalog_object RENAME COLUMN exposed_schema TO duckdb_schema;
ALTER TABLE catalog_object RENAME COLUMN exposed_name TO duckdb_name;
ALTER TABLE catalog_element RENAME COLUMN exposed_name TO duckdb_name;
ALTER TABLE catalog_element RENAME COLUMN exposed_type TO duckdb_type;
ALTER FUNCTION preserve_catalog_exposed_name() RENAME TO preserve_catalog_duckdb_name;
CREATE OR REPLACE FUNCTION preserve_catalog_duckdb_name() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE names_changed boolean;
BEGIN
  names_changed := NEW.duckdb_name IS DISTINCT FROM OLD.duckdb_name
    OR (to_jsonb(NEW)->'duckdb_schema') IS DISTINCT FROM (to_jsonb(OLD)->'duckdb_schema');
  IF names_changed THEN
    IF NEW.name_revision <> OLD.name_revision + 1 OR NEW.duckdb_name IS NULL THEN
      RAISE EXCEPTION 'Exposed name changes require explicit adoption and one revision increment' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.name_revision <> OLD.name_revision THEN
    RAISE EXCEPTION 'A name revision requires an exposed name change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION guard_source_alias() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duckdb_alias IS DISTINCT FROM OLD.duckdb_alias THEN
    RAISE EXCEPTION 'A source DuckDB alias is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
-- Preserve recorded names, including removed elements in historical diffs.
UPDATE introspection_run SET diff=(SELECT coalesce(jsonb_agg(CASE WHEN entry ? 'exposedName'
  THEN (entry - 'exposedName') || jsonb_build_object('duckdbName',entry->'exposedName') ELSE entry END ORDER BY ordinal),'[]'::jsonb)
  FROM jsonb_array_elements(diff) WITH ORDINALITY AS entries(entry,ordinal));
