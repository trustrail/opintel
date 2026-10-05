-- Derived domains are execution facts, never stored declarations.
-- No explicit declaration may claim the isolated element namespace.
ALTER TABLE catalog_element ADD CONSTRAINT catalog_element_token_domain_namespace
 CHECK (token_domain NOT LIKE 'opintelisolated%');
