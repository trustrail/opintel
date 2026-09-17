REVOKE ALL PRIVILEGES ON company_member, project_member, relationship_outbox
  FROM opintel_platform, opintel_platform_admin;
DROP TABLE relationship_outbox;
DROP TABLE project_member;
DROP TABLE company_member;
