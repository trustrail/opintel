CREATE TABLE company_idp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL,
  issuer text NOT NULL,
  client_id text NOT NULL,
  client_secret_ref text NOT NULL,
  discovery_url text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider),
  CONSTRAINT secret_is_reference CHECK (client_secret_ref LIKE 'vault://%')
);
