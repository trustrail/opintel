DROP POLICY tenant_read ON token_key_operation;
ALTER POLICY tenant_write ON token_key_operation RENAME TO token_key_operation_tenant;
DROP POLICY tenant_read ON token_key_version;
ALTER POLICY tenant_write ON token_key_version RENAME TO token_key_version_tenant;
