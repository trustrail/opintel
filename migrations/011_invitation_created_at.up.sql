ALTER TABLE pending_invite ADD COLUMN created_at timestamptz;
UPDATE pending_invite SET created_at = expires_at - interval '7 days';
ALTER TABLE pending_invite ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE pending_invite ALTER COLUMN created_at SET NOT NULL;
