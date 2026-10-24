-- Installation-local admission. A claim grants no role and contains no secret.
CREATE TABLE installation_owner_claim (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 claimant jsonb NOT NULL CHECK(jsonb_typeof(claimant)='object' AND claimant ?& ARRAY['kind','email'] AND claimant->>'kind'='email' AND jsonb_typeof(claimant->'email')='string' AND claimant-'kind'-'email'='{}'::jsonb AND claimant->>'email'=lower(btrim(claimant->>'email'))),
 company jsonb NOT NULL CHECK(jsonb_typeof(company)='object'),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT statement_timestamp()+interval '24 hours',
 redeemed_at timestamptz,
 redeemed_by uuid REFERENCES user_account(id),
 company_id uuid REFERENCES company(id),
 outbox_id bigint REFERENCES relationship_outbox(id),
 CHECK(expires_at=created_at+interval '24 hours'),
 CONSTRAINT installation_owner_claim_redemption CHECK((redeemed_at IS NULL AND redeemed_by IS NULL AND company_id IS NULL AND outbox_id IS NULL)
    OR (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL AND company_id IS NOT NULL AND outbox_id IS NOT NULL AND redeemed_at<expires_at))
);
ALTER TABLE installation_owner_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_owner_claim FORCE ROW LEVEL SECURITY;
CREATE POLICY installation_read ON installation_owner_claim FOR SELECT TO opintel_platform,opintel_platform_admin USING(true);
CREATE POLICY installation_issue ON installation_owner_claim FOR INSERT TO opintel_platform_admin WITH CHECK(redeemed_at IS NULL);
CREATE POLICY installation_redeem ON installation_owner_claim FOR UPDATE TO opintel_platform USING(redeemed_at IS NULL) WITH CHECK(redeemed_at IS NOT NULL);
REVOKE ALL ON installation_owner_claim FROM PUBLIC,opintel_app,opintel_platform,opintel_platform_admin;
GRANT SELECT ON installation_owner_claim TO opintel_platform,opintel_platform_admin;
GRANT INSERT ON installation_owner_claim TO opintel_platform_admin;
-- Existing isolated test resets use the platform-admin scope and CASCADE.
GRANT TRUNCATE ON installation_owner_claim TO opintel_platform_admin;
GRANT UPDATE(redeemed_at,redeemed_by,company_id,outbox_id) ON installation_owner_claim TO opintel_platform;

ALTER TABLE magic_link_token ADD COLUMN installation_claim_id uuid;
ALTER TABLE magic_link_token ADD CONSTRAINT magic_link_installation_claim
 FOREIGN KEY(installation_claim_id) REFERENCES installation_owner_claim(id) NOT VALID;
ALTER TABLE magic_link_token VALIDATE CONSTRAINT magic_link_installation_claim;
ALTER TABLE magic_link_token ADD CONSTRAINT magic_link_one_admission
 CHECK(installation_claim_id IS NULL OR invite_id IS NULL) NOT VALID;
ALTER TABLE magic_link_token VALIDATE CONSTRAINT magic_link_one_admission;

-- Production startup verifies compatibility; it never executes migrations.
GRANT SELECT ON schema_migration TO opintel_platform;
