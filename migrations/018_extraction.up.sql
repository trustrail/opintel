-- Expand only: existing cedants and rules keep NULL declarations.
-- Extraction refuses missing locale/sheet declarations. Do not guess a backfill.
-- See docs/review/extraction-backfill.md. Required-field enforcement belongs in
-- a later migration, released only after the deployment backfill is complete.
ALTER TABLE cedant
  ADD COLUMN decimal_separator char(1) CHECK (decimal_separator IN ('.', ',')),
  ADD COLUMN date_format text CHECK (length(date_format) > 0);
ALTER TABLE cedant_file_rule
  ADD COLUMN sheet text,
  ADD COLUMN sheet_index integer CHECK (sheet_index >= 1),
  ADD COLUMN header_row integer NOT NULL DEFAULT 1 CHECK (header_row >= 1),
  ADD COLUMN verify_column text,
  ADD COLUMN verify_value text,
  ADD CONSTRAINT extraction_sheet_name CHECK (sheet IS NULL OR length(sheet) > 0),
  ADD CONSTRAINT extraction_verification_pair CHECK ((verify_column IS NULL) = (verify_value IS NULL)),
  ADD CONSTRAINT extraction_verification_column CHECK (verify_column IS NULL OR length(verify_column) > 0);
