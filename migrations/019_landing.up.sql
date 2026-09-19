-- Expand safely over existing sources and identification rules. No strategy or
-- period interpretation is inferred for a pre-existing row.
ALTER TABLE data_source
  ADD COLUMN receives_landings boolean NOT NULL DEFAULT false,
  ADD COLUMN landing_strategy text CHECK (landing_strategy IN ('append_as_at','table_per_filing')),
  ADD COLUMN first_landed_at timestamptz;
ALTER TABLE cedant_file_rule ADD COLUMN period_as_at_format text
  CHECK (period_as_at_format IN ('month_end','month_start','quarter_end','exact_date'));
CREATE FUNCTION guard_landing_strategy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.first_landed_at IS NOT NULL AND
    (NEW.landing_strategy IS DISTINCT FROM OLD.landing_strategy OR
     NEW.first_landed_at IS DISTINCT FROM OLD.first_landed_at OR NOT NEW.receives_landings) THEN
    RAISE EXCEPTION 'Landing strategy is immutable after the first filing' USING ERRCODE = '23514';
  END IF;
  IF NEW.receives_landings AND NEW.status = 'connected' AND NEW.landing_strategy IS NULL THEN
    RAISE EXCEPTION 'Sources receiving landings require an explicit landing strategy' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER data_source_landing_strategy BEFORE INSERT OR UPDATE ON data_source
  FOR EACH ROW EXECUTE FUNCTION guard_landing_strategy();
-- Delivery inbox only; item 3.10 reconciles these receipts with arrival history.
CREATE TABLE landing_receipt (
  filing_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  source_id uuid NOT NULL,
  payload jsonb NOT NULL,
  FOREIGN KEY (source_id, project_id) REFERENCES data_source(id, project_id) ON DELETE CASCADE
);
ALTER TABLE landing_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON landing_receipt FOR SELECT USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
CREATE POLICY tenant_write ON landing_receipt FOR INSERT WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid);
GRANT SELECT, INSERT ON landing_receipt TO opintel_app;
GRANT SELECT, INSERT, TRUNCATE ON landing_receipt TO opintel_platform_admin;
