REVOKE SELECT ON schema_migration FROM opintel_platform;
ALTER TABLE magic_link_token DROP CONSTRAINT magic_link_one_admission;
ALTER TABLE magic_link_token DROP CONSTRAINT magic_link_installation_claim;
ALTER TABLE magic_link_token DROP COLUMN installation_claim_id;
DROP TABLE installation_owner_claim;
-- Historical audit entries are deliberately retained.
