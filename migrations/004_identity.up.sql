CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL UNIQUE, full_name text,
  avatar_url text, timezone text NOT NULL DEFAULT 'UTC', created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE TABLE user_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  provider text NOT NULL, provider_subject text NOT NULL, email_verified boolean NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(), UNIQUE (provider, provider_subject)
);
CREATE TABLE pending_invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL,
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  project_id uuid REFERENCES project(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','operator','viewer')), token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, accepted_at timestamptz,
  created_by uuid NOT NULL REFERENCES user_account(id)
);
CREATE TABLE magic_link_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL, token_hash bytea NOT NULL UNIQUE,
  device_nonce text NOT NULL, invite_id uuid REFERENCES pending_invite(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL, consumed_at timestamptz, requested_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX magic_link_token_email_created_at_idx ON magic_link_token (email, created_at DESC);
CREATE INDEX magic_link_token_unconsumed_expiry_idx ON magic_link_token (expires_at) WHERE consumed_at IS NULL;
