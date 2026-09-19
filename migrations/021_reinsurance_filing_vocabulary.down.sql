DELETE FROM vocabulary_term WHERE scope = 'industry'
  AND industry_id = (SELECT id FROM industry WHERE slug = 'reinsurance-treaty')
  AND ((kind = 'subject' AND name = 'filing_party') OR (kind = 'parameter' AND name = 'filing_kind'));
