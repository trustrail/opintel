-- Schema discovery is a saved-source operation, separate from catalogue scans.
ALTER TABLE data_source ADD COLUMN schema_listing_error text;
