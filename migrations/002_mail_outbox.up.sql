CREATE TABLE mail_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_email text NOT NULL,
  template text NOT NULL,
  vars jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  provider_id text
);

CREATE INDEX mail_outbox_pending_idx
  ON mail_outbox (created_at)
  WHERE dispatched_at IS NULL;
