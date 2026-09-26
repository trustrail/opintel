-- UUID order is not source order. Existing ordinals stay unknown until the
-- startup introspection repair obtains a fresh snapshot. Do not guess a backfill.
ALTER TABLE catalog_element
  ADD COLUMN ordinal integer CHECK (ordinal >= 0),
  ADD COLUMN token_domain text CHECK (token_domain ~ '^[a-z0-9]+$' AND token_domain !~ '[^a-z0-9]' AND token_domain <> 'sentinel'),
  ADD COLUMN case_insensitive boolean;
-- case_insensitive is meaningful only in text mode. Type-family changes may
-- retain a historical declaration; entitlement-time validation rejects it on
-- a non-text element until it is cleared, just like temporal declarations.
COMMENT ON COLUMN catalog_element.ordinal IS 'Source ordinal; NULL requires re-introspection before view compilation. NOT NULL follows in a later migration after repair.';
