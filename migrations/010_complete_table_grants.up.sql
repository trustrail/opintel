-- Complete the shared vocabulary/demo grants omitted by 006. Read-only
-- application scopes match industry/vocabulary_term; pack management belongs
-- to the platform administrator. Synonyms are accessed through their term.
GRANT SELECT ON term_synonym, demo_source_template
  TO opintel_app, opintel_platform;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON term_synonym, demo_source_template
  TO opintel_platform_admin;

-- 007 only seeds industry. 008 already grants company_member, project_member
-- and relationship_outbox to both platform roles; no tenant grant is needed.
-- schema_migration remains owner-only.
