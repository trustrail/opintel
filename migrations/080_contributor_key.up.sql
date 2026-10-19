-- Explicit source-authored entity identity for aggregate disclosure floors.
-- Never infer this declaration from a primary key or the protected value.
ALTER TABLE catalog_element ADD COLUMN contributor_key boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX catalog_element_contributor_key ON catalog_element(object_id) WHERE contributor_key AND status='active';
