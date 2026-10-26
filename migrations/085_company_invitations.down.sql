DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pending_invite WHERE company_role IS NOT NULL) THEN
  RAISE EXCEPTION 'Company invitations exist; rollback would discard admission history';
 END IF;
END $$;
ALTER TABLE pending_invite DROP CONSTRAINT pending_invite_company_scope;
ALTER TABLE pending_invite DROP COLUMN company_role;
