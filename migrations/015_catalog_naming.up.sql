ALTER TABLE catalog_element ALTER COLUMN duckdb_name DROP NOT NULL;
ALTER TABLE catalog_element ALTER COLUMN duckdb_type DROP NOT NULL;
ALTER TABLE catalog_element ADD COLUMN name_revision integer NOT NULL DEFAULT 0 CHECK (name_revision >= 0);
ALTER TABLE catalog_object ADD COLUMN name_revision integer NOT NULL DEFAULT 0 CHECK (name_revision >= 0);

-- Adoption is explicit row state, not a connection/session bypass. Ordinary
-- updates preserve the revision; an adoption advances it exactly once. The
-- administrator check and durable diff belong to the application in item 3.6.
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
DROP TRIGGER catalog_object_immutable_schema ON catalog_object;
DROP FUNCTION preserve_catalog_duckdb_schema();
