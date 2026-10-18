-- Public association metadata only. Opintel must never hold the agent's private
-- or transport key: doing so would let it fetch K1 and collapse two-party custody.
-- Identity kind is an application enum stored as text, so adding 'idp' later
-- needs no database schema change. Only 'certificate' is accepted by today's API.
ALTER TABLE pool_credential
 ADD COLUMN certificate_id integer,
 ADD COLUMN device_name text,
 ADD COLUMN recipient_identifier text,
 ADD COLUMN identity_kind text,
 ADD COLUMN association_status text,
 ADD COLUMN association_recorded_at timestamptz,
 ADD CONSTRAINT credential_association_complete CHECK (
  num_nonnulls(certificate_id,device_name,recipient_identifier,identity_kind,association_status,association_recorded_at)=0 OR
  (num_nonnulls(certificate_id,device_name,recipient_identifier,identity_kind,association_status,association_recorded_at)=6
   AND certificate_id>0 AND length(device_name) BETWEEN 1 AND 48
   AND length(recipient_identifier)>0 AND length(identity_kind)>0
   AND association_status IN ('associated','revoked'))
 );
