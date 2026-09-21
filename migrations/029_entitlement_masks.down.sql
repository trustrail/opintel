ALTER TABLE entitlement DROP CONSTRAINT mask_kind_when_masked;
ALTER TABLE entitlement DROP CONSTRAINT entitlement_mask_kind;
ALTER TABLE entitlement DROP COLUMN mask_kind;
