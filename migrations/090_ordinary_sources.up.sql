-- Preserve every source identity and all dependent governance/landing records.
-- Credential references and explicit schema selections are retained verbatim.
UPDATE data_source SET kind='postgres',origin='customer',demo_template_id=NULL
WHERE kind='demo' OR origin='demo' OR demo_template_id IS NOT NULL;
