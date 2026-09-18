REVOKE SELECT ON term_synonym FROM opintel_app, opintel_platform;
REVOKE SELECT ON demo_source_template FROM opintel_app;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON term_synonym, demo_source_template
  FROM opintel_platform_admin;
-- Preserve the platform SELECT on demo_source_template introduced by 009.
