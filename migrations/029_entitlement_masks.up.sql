-- IF NOT EXISTS permits an operator to add the nullable column and explicitly
-- backfill existing decisions before retrying this migration. Never guess a mask.
ALTER TABLE entitlement ADD COLUMN IF NOT EXISTS mask_kind text;
DO $$
DECLARE missing text;
BEGIN
 SELECT string_agg(pool_id::text || '/' || element_id::text, ', ' ORDER BY pool_id,element_id)
 INTO missing FROM entitlement WHERE treatment='masked' AND mask_kind IS NULL;
 IF missing IS NOT NULL THEN
  RAISE EXCEPTION 'Masked entitlements need an explicit mask_kind backfill (pool/element): %', missing
   USING HINT = 'Add entitlement.mask_kind as nullable text, have the decision owner select each mask, then retry migration 029. No default is safe.';
 END IF;
END
$$;
ALTER TABLE entitlement ADD CONSTRAINT entitlement_mask_kind CHECK (mask_kind IN ('last4','email','year','all'));
ALTER TABLE entitlement ADD CONSTRAINT mask_kind_when_masked CHECK ((treatment='masked') = (mask_kind IS NOT NULL));
