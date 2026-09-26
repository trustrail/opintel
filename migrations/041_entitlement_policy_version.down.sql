DROP TRIGGER entitlement_policy_delete ON public.entitlement;
DROP TRIGGER entitlement_policy_update ON public.entitlement;
DROP TRIGGER entitlement_policy_insert ON public.entitlement;
DROP FUNCTION public.bump_entitlement_policy_version();
ALTER TABLE public.project DROP COLUMN policy_version_txid;
-- Keep the monotonically advanced policy_version values on downgrade.
