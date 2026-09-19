-- Industry data, not platform identities or platform validation rules.
INSERT INTO vocabulary_term (scope, industry_id, kind, name, display_name, description)
SELECT 'industry', id, 'subject', 'filing_party', 'Cedant', 'The party supplying a reinsurance filing.'
FROM industry WHERE slug = 'reinsurance-treaty';
INSERT INTO vocabulary_term (scope, industry_id, kind, name, display_name, description, param_type, enum_values)
SELECT 'industry', id, 'parameter', 'filing_kind', 'Filing kind', 'Meaningful filing kinds in the reinsurance pack.', 'enum', '["premium","claims","submission"]'::jsonb
FROM industry WHERE slug = 'reinsurance-treaty';
