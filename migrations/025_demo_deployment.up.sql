-- Deployment metadata is operator-owned, and never returned to the browser.
ALTER TABLE demo_source_template ADD COLUMN deployment_ref jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(deployment_ref) = 'object');
