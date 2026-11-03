-- Ephemeral enrollment verifier only: no nonce, agent keys or query values.
ALTER TABLE pool_credential ADD COLUMN enrollment_challenge jsonb
 CHECK (enrollment_challenge IS NULL OR jsonb_typeof(enrollment_challenge)='object');
