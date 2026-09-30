import {createHash} from 'node:crypto';
import {withPlatform} from '../../../platform/db/scope.js';
import type {CompanyId,UserId} from '../../../shared/kernel/index.js';
import type {MagicLinkAccess,MagicLinkUse} from '../application/magic-link-access.js';
import {domainForProviderLookup} from '../application/providers.js';

export class PostgresMagicLinkAccess implements MagicLinkAccess {
 async check(email:string,use?:MagicLinkUse):Promise<boolean>{
  const domain=domainForProviderLookup(email);
  return withPlatform(async tx=>{
   // Domain, existing memberships and pending invitations can each impose SSO.
   // Only an existing company administrator qualifies; an invitation never does.
   const restrictions=await tx.query<{company_id:CompanyId;user_id:UserId|null;administrator:boolean}>(`
    SELECT c.id AS company_id,u.id AS user_id,
      EXISTS(SELECT 1 FROM company_member m WHERE m.company_id=c.id AND m.user_id=u.id AND m.role='admin') AS administrator
    FROM company c LEFT JOIN user_account u ON u.email=$1
    WHERE c.sso_enforced AND (
      EXISTS(SELECT 1 FROM unnest(c.allowed_domains) d WHERE lower(d)=$2)
      OR EXISTS(SELECT 1 FROM company_member m WHERE m.company_id=c.id AND m.user_id=u.id)
      OR EXISTS(SELECT 1 FROM project_member m JOIN project p ON p.id=m.project_id WHERE p.company_id=c.id AND m.user_id=u.id)
      OR EXISTS(SELECT 1 FROM pending_invite i WHERE i.company_id=c.id AND i.email=$1 AND i.accepted_at IS NULL AND i.expires_at>now()))
    ORDER BY c.id`,[email,domain]);
   if(restrictions.some(row=>!row.administrator||row.user_id===null))return false;
   if(use)for(const row of restrictions){
    await tx.query(`INSERT INTO audit_entry(company_id,actor_id,actor_kind,action,target,after)
      VALUES($1,$2,$3,'SsoBreakGlassUsed',$4,$5)`,[
     row.company_id,use.stage==='link_issuance_authorized'?null:row.user_id,use.stage==='link_issuance_authorized'?'system':'user',
     {companyId:row.company_id,userId:row.user_id},
     {stage:use.stage,method:'magic_link',...(use.sessionId?{sessionFingerprint:createHash('sha256').update(use.sessionId).digest('hex')}:{})},
    ]);
   }
   return true;
  });
 }
}
