-- Refuse to destroy release history or silently demote existing custody decisions.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM release_event) OR EXISTS(SELECT 1 FROM release_grant) OR EXISTS(SELECT 1 FROM entitlement WHERE treatment='custody') OR EXISTS(SELECT 1 FROM pattern_rule WHERE treatment='custody') OR EXISTS(SELECT 1 FROM bulk_decision WHERE treatment='custody') OR EXISTS(SELECT 1 FROM run_element WHERE treatment='custody') THEN
  RAISE EXCEPTION 'Release custody history or decisions exist; downgrade refused';
 END IF;
END $$;
DROP TABLE release_event;
DROP TABLE release_grant;
DROP TABLE release_signing_key;
DROP FUNCTION public.resolve_custody_alias(bytea);
DROP TRIGGER pool_key_custody_alias ON pool_key;
DROP FUNCTION public.bind_custody_alias();
ALTER TABLE pool_key DROP COLUMN custody_alias;
ALTER TABLE entitlement DROP CONSTRAINT entitlement_treatment_check;
ALTER TABLE entitlement ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','withheld'));
ALTER TABLE pattern_rule DROP CONSTRAINT pattern_rule_treatment_check;
ALTER TABLE pattern_rule ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','withheld'));
ALTER TABLE bulk_decision DROP CONSTRAINT bulk_decision_treatment_check;
ALTER TABLE bulk_decision ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only','withheld'));
ALTER TABLE run_element DROP CONSTRAINT run_element_treatment_check;
ALTER TABLE run_element ADD CHECK(treatment IN ('clear','tokenized','masked','aggregate_only'));
