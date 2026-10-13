-- Tags bind future project templates to catalogue columns; no rule consumes them yet.
ALTER TABLE catalog_element ADD COLUMN scope_tags jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK(jsonb_typeof(scope_tags)='object' AND NOT jsonb_path_exists(scope_tags,'$.* ? (@.type() != "string")'));
