import type {Tx} from '../../../platform/db/scope.js';
import {DomainError,err,ok,type CompanyId,type UserId,type Result} from '../../../shared/kernel/index.js';
/** Caller holds the company row lock and has checked company#administer. */
export async function checkSsoEnforcement(tx:Tx,companyId:CompanyId,actor:UserId):Promise<Result<void>>{
 const providers=await tx.query<{verified:boolean}>(`SELECT EXISTS(SELECT 1 FROM company_idp_sign_in proof WHERE proof.idp_id=i.id AND proof.configuration_version=i.configuration_version AND proof.user_id=$2) AS verified FROM company_idp i WHERE company_id=$1 AND enabled`,[companyId,actor]);
 if(providers.length!==1)return err(new DomainError('conflict','Enforced SSO requires exactly one enabled company identity provider. Configure one provider before enabling SSO.'));
 if(!providers[0]!.verified)return err(new DomainError('conflict','Before enabling SSO enforcement, sign in through the company provider using its current configuration. A completed sign-in by you is required; a provider connection check is not sufficient.'));
 return ok(undefined);
}
