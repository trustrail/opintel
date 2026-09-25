ALTER TABLE data_source RENAME COLUMN duckdb_alias TO exposed_alias;
ALTER TABLE catalog_object RENAME COLUMN duckdb_schema TO exposed_schema;
ALTER TABLE catalog_object RENAME COLUMN duckdb_name TO exposed_name;
ALTER TABLE catalog_element RENAME COLUMN duckdb_name TO exposed_name;
ALTER TABLE catalog_element RENAME COLUMN duckdb_type TO exposed_type;
ALTER FUNCTION preserve_catalog_duckdb_name() RENAME TO preserve_catalog_exposed_name;
CREATE OR REPLACE FUNCTION preserve_catalog_exposed_name() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE names_changed boolean;
BEGIN
  names_changed := NEW.exposed_name IS DISTINCT FROM OLD.exposed_name
    OR (to_jsonb(NEW)->'exposed_schema') IS DISTINCT FROM (to_jsonb(OLD)->'exposed_schema');
  IF names_changed THEN
    IF NEW.name_revision <> OLD.name_revision + 1 OR NEW.exposed_name IS NULL THEN
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
  IF NEW.exposed_alias IS DISTINCT FROM OLD.exposed_alias THEN
    RAISE EXCEPTION 'A source exposed alias is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
-- Preserve recorded names, including removed elements in historical diffs.
UPDATE introspection_run SET diff=(SELECT coalesce(jsonb_agg(CASE WHEN entry ? 'duckdbName'
  THEN (entry - 'duckdbName') || jsonb_build_object('exposedName',entry->'duckdbName') ELSE entry END ORDER BY ordinal),'[]'::jsonb)
  FROM jsonb_array_elements(diff) WITH ORDINALITY AS entries(entry,ordinal));
