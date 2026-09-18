DROP INDEX introspection_one_active;
ALTER TABLE introspection_run DROP CONSTRAINT introspection_state;
ALTER TABLE introspection_run DROP COLUMN diff;
ALTER TABLE introspection_run DROP COLUMN include_schemas;
