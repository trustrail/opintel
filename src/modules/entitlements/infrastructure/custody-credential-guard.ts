import type {Tx} from '../../../platform/db/scope.js';
import {DomainError,err,ok,type PoolId} from '../../../shared/kernel/index.js';
export async function custodyCredentialGuard(tx:Tx,pool:PoolId){
 await tx.query('SELECT id FROM pool WHERE id=$1 FOR UPDATE',[pool]);
 const rows=await tx.query<{label:string}>("SELECT label FROM pool_credential WHERE pool_id=$1 AND credential_kind='bearer-only' AND revoked_at IS NULL ORDER BY label",[pool]);
 return rows.length?err(new DomainError('validation_failed','Custody requires identity-bound credentials. Revoke these bearer-only credentials first: '+rows.map(row=>row.label).join(', ')+'.')):ok(undefined);
}
