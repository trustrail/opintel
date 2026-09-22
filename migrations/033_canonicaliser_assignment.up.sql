-- An absent override uses the built-in for the element's current mode.
-- Only the id is persisted; canonicaliser code always stays in the sidecar.
ALTER TABLE catalog_element ADD COLUMN canon_id text CHECK (canon_id ~ '^[a-z0-9]+$' AND canon_id !~ '[^a-z0-9]');
