DROP TABLE landing_receipt;
DROP TRIGGER data_source_landing_strategy ON data_source;
DROP FUNCTION guard_landing_strategy();
ALTER TABLE cedant_file_rule DROP COLUMN period_as_at_format;
ALTER TABLE data_source DROP COLUMN first_landed_at, DROP COLUMN landing_strategy, DROP COLUMN receives_landings;
