-- Explicit marker: historical projectless invitations must not become company grants.
ALTER TABLE pending_invite ADD COLUMN company_role text CHECK (company_role IN ('admin','member'));
ALTER TABLE pending_invite ADD CONSTRAINT pending_invite_company_scope CHECK (company_role IS NULL OR project_id IS NULL);
