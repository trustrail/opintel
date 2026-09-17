CREATE TABLE company_member (
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES user_account(id),
  PRIMARY KEY (company_id, user_id)
);

CREATE TABLE project_member (
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES user_account(id),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE relationship_outbox (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  operation text NOT NULL CHECK (operation IN ('touch', 'delete')),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  relation text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  written_at timestamptz,
  zed_token text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX relationship_outbox_pending_idx ON relationship_outbox (created_at) WHERE written_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON company_member, project_member, relationship_outbox
  TO opintel_platform, opintel_platform_admin;
