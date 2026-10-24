import {withPlatformAdmin} from '../../../platform/db/scope.js';
import {DomainError,InstallationClaimId,Timestamp,err,ok} from '../../../shared/kernel/index.js';
import type {InstallationClaimWriter,InstallationClaimInput} from '../application/installation-claim.js';

/** Operator-only adapter. Never wired to an HTTP route or normal login. */
export class PostgresInstallationClaimWriter implements InstallationClaimWriter {
 create(input:InstallationClaimInput):ReturnType<InstallationClaimWriter['create']>{
  return withPlatformAdmin({actor:{kind:'system',name:'gateway-owner-claim'}},async tx=>{
   // Serializes against ordinary company INSERTs too, not just other CLI calls.
   await tx.query('LOCK TABLE company IN SHARE ROW EXCLUSIVE MODE');
   const refuse=async(reason:string,message:string)=>{
    await tx.query("INSERT INTO audit_entry(actor_kind,action,target,after) VALUES('system','InstallationOwnerClaimRefused',$1,$2)",[{installation:true},{reason}]);
    return err(new DomainError('conflict',message));
   };
   if((await tx.query('SELECT id FROM company LIMIT 1')).length)return refuse('company_exists','Owner claim refused: a company already exists.');
   if((await tx.query('SELECT id FROM installation_owner_claim WHERE redeemed_at IS NOT NULL LIMIT 1')).length)return refuse('already_redeemed','Owner claim refused: this installation has already been claimed.');
   if((await tx.query('SELECT id FROM installation_owner_claim WHERE redeemed_at IS NULL AND expires_at>clock_timestamp() LIMIT 1')).length)return refuse('claim_active','Owner claim refused: an unexpired claim already exists.');
   if(input.company.defaultIndustryId!==null&&!(await tx.query('SELECT id FROM industry WHERE id=$1',[input.company.defaultIndustryId])).length)return refuse('industry_missing','The selected default industry does not exist.');
   const [row]=await tx.query<{id:string;expires_at:Date}>(
    'INSERT INTO installation_owner_claim(claimant,company) VALUES($1,$2) RETURNING id,expires_at',[input.claimant,input.company]);
   if(!row)throw new Error('Owner claim insert returned no record.');
   const claim={id:InstallationClaimId(row.id),expiresAt:Timestamp(row.expires_at)};
   await tx.query("INSERT INTO audit_entry(actor_kind,action,target,after) VALUES('system','InstallationOwnerClaimCreated',$1,$2)",[{claimId:claim.id},{claimant:input.claimant,company:input.company,expiresAt:claim.expiresAt}]);
   return ok(claim);
  });
 }
}
