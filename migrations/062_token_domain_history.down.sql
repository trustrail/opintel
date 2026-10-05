DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM token_domain_assignment WHERE version>1) THEN
  RAISE EXCEPTION 'Cannot downgrade: token domain assignment history would be lost';
 END IF;
END $$;
DROP TRIGGER token_domain_assignment ON catalog_element;
DROP FUNCTION public.record_token_domain_assignment();
DROP TABLE token_domain_assignment;
