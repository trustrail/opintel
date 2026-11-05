ALTER TABLE user_account ADD COLUMN theme text NOT NULL DEFAULT 'system' CHECK(theme IN ('light','dark','system'));
