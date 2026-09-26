DROP FUNCTION public.resolve_pool_key(bytea);
DROP TABLE pool_key_request;
ALTER TABLE project DROP CONSTRAINT pool_key_grace_seconds_valid;
