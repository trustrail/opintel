DROP FUNCTION public.save_custody_credentials(text,jsonb);
ALTER TABLE project DROP COLUMN custody_credentials, DROP COLUMN custody_credentials_changed_at;
