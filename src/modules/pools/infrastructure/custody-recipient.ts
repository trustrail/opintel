import {withTenant} from '../../../platform/db/scope.js';
import type {PoolKeyContext} from '../application/keys.js';

/** Resolve a stored certificate recipient within the calling project.
 * The lookup identity may belong to a credential's earlier key version still in
 * its retirement grace period. It only locates the credential's association:
 * never return the lookup identity or derive an XQ recipient from it.
 */
export async function credentialCustodyRecipient(ctx:PoolKeyContext,credentialLookupIdentity:string):Promise<string|null> {
 return withTenant(ctx,async tx=>{
  const [row]=await tx.query<{recipient_identifier:string}>(`SELECT c.recipient_identifier FROM pool_credential c
   WHERE c.revoked_at IS NULL AND c.identity_kind='certificate' AND c.association_status='associated'
    AND c.certificate_id IS NOT NULL AND c.device_name IS NOT NULL AND c.association_recorded_at IS NOT NULL
    AND (c.custody_alias=$1 OR EXISTS(SELECT 1 FROM pool_key k WHERE k.credential_id=c.id
     AND k.custody_alias=$1 AND k.state='retiring' AND k.grace_until>clock_timestamp() AND k.alias_retired_at IS NULL))`,[credentialLookupIdentity]);
  return row?.recipient_identifier??null;
 });
}
