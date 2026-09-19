-- Refuse downgrade when a new pack's kinds cannot fit the historical schema.
-- The migration runner wraps this in one transaction: no partial rename.
ALTER TABLE filing_party_rule ADD CONSTRAINT cedant_file_rule_kind_check CHECK (kind IN ('premium','claims','submission'));
ALTER TABLE filing_party_rule DROP CONSTRAINT filing_party_rule_kind_nonempty;
ALTER TABLE filing_party_rule RENAME CONSTRAINT filing_party_rule_period_as_at_format_check TO cedant_file_rule_period_as_at_format_check;
ALTER TABLE filing_party_rule RENAME CONSTRAINT filing_party_rule_header_row_check TO cedant_file_rule_header_row_check;
ALTER TABLE filing_party_rule RENAME CONSTRAINT filing_party_rule_sheet_index_check TO cedant_file_rule_sheet_index_check;
ALTER TABLE filing_party_rule RENAME CONSTRAINT filing_party_rule_match_kind_check TO cedant_file_rule_match_kind_check;
ALTER TABLE filing_party_rule RENAME CONSTRAINT filing_party_rule_party_id_project_id_fkey TO cedant_file_rule_cedant_id_project_id_fkey;
ALTER TABLE filing_party_rule RENAME CONSTRAINT filing_party_rule_project_id_fkey TO cedant_file_rule_project_id_fkey;
ALTER TABLE filing_party_rule RENAME CONSTRAINT filing_party_rule_pkey TO cedant_file_rule_pkey;
ALTER TABLE filing_party RENAME CONSTRAINT filing_party_date_format_check TO cedant_date_format_check;
ALTER TABLE filing_party RENAME CONSTRAINT filing_party_decimal_separator_check TO cedant_decimal_separator_check;
ALTER INDEX filing_party_project_code RENAME TO cedant_project_code;
ALTER TABLE filing_party RENAME CONSTRAINT filing_party_project_id_fkey TO cedant_project_id_fkey;
ALTER TABLE filing_party RENAME CONSTRAINT filing_party_id_project_id_key TO cedant_id_project_id_key;
ALTER TABLE filing_party RENAME CONSTRAINT filing_party_pkey TO cedant_pkey;
ALTER TABLE filing_party_rule RENAME COLUMN party_id TO cedant_id;
ALTER TABLE filing_party_rule RENAME TO cedant_file_rule;
ALTER TABLE filing_party RENAME TO cedant;
