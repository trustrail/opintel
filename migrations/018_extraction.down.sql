ALTER TABLE cedant_file_rule
  DROP COLUMN verify_value, DROP COLUMN verify_column, DROP COLUMN header_row,
  DROP COLUMN sheet_index, DROP COLUMN sheet;
ALTER TABLE cedant DROP COLUMN date_format, DROP COLUMN decimal_separator;
