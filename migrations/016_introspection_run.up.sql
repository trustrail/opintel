ALTER TABLE introspection_run ADD COLUMN include_schemas text[] NOT NULL DEFAULT '{}';
ALTER TABLE introspection_run ADD COLUMN diff jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(diff) = 'array');
ALTER TABLE introspection_run ADD CONSTRAINT introspection_state CHECK (state IN ('queued','connecting','reading','diffing','complete','failed','cancelled'));
CREATE UNIQUE INDEX introspection_one_active ON introspection_run (source_id) WHERE state IN ('queued','connecting','reading','diffing');
