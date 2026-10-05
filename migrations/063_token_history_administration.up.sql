-- Platform administration owns root teardown; CASCADE requires this grant on
-- dependent history. No tenant route has this role or privilege.
GRANT TRUNCATE ON token_domain_assignment TO opintel_platform_admin;
