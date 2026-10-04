DROP POLICY tenant_read ON engine;
ALTER POLICY tenant_write ON engine RENAME TO engine_tenant;
GRANT SELECT,INSERT,UPDATE,DELETE ON engine TO opintel_platform;
