import {randomUUID,createHash} from 'node:crypto';
import {withPlatform,type Tx} from '../../../platform/db/scope.js';
import {CompanyId,DomainError,InstallationClaimId,UserId,err,ok} from '../../../shared/kernel/index.js';
import {CreateCompanyBody} from '../../../shared/api/tenancy-schemas.js';
import type {ClaimLogin,InstallationClaimRepository} from '../application/installation-claim.js';
import type {RelationshipOutbox} from '../application/relationship-outbox.js';

const active="redeemed_at IS NULL AND expires_at>clock_timestamp() AND claimant->>'kind'='email'";
async function refused(tx:Tx,claim:InstallationClaimId,reason:string){
 await tx.query("INSERT INTO audit_entry(actor_kind,action,target,after) VALUES('system','InstallationOwnerRedemptionRefused',$1,$2)",[{claimId:claim},{reason}]);
 return err(new DomainError('forbidden','The installation owner claim is unavailable or expired. Ask the gateway operator to check the claim.'));
}

export class PostgresInstallationClaimRepository implements InstallationClaimRepository {
 constructor(private readonly outbox:RelationshipOutbox){}
 pendingGrants(){return withPlatform(async tx=>(await tx.query<{id:string}>(`SELECT o.id FROM installation_owner_claim c JOIN relationship_outbox o ON o.id=c.outbox_id WHERE c.redeemed_at IS NOT NULL AND o.written_at IS NULL ORDER BY o.id LIMIT 1`)).map(row=>BigInt(row.id)));}
 find(email:string){return withPlatform(async tx=>{
  const [row]=await tx.query<{id:string}>(`SELECT id FROM installation_owner_claim WHERE ${active} AND claimant->>'email'=$1 AND NOT EXISTS(SELECT 1 FROM company) ORDER BY created_at DESC LIMIT 1`,[email]);
  return row?InstallationClaimId(row.id):null;
 });}
 prepare(claim:InstallationClaimId,email:string):ReturnType<InstallationClaimRepository['prepare']>{return withPlatform(async tx=>{
  const [row]=await tx.query(`SELECT id FROM installation_owner_claim WHERE id=$1 AND ${active} AND claimant->>'email'=$2 AND NOT EXISTS(SELECT 1 FROM company)`,[claim,email]);
  if(!row)return refused(tx,claim,'inactive_claim');
  const [account]=await tx.query<{id:string}>('SELECT id FROM user_account WHERE email=$1',[email]);
  // No account or role is created until the normal login has established its
  // session and redemption succeeds. Expired claims cannot leave login-eligible
  // orphan accounts behind.
  return ok({id:UserId(account?.id??randomUUID()),email});
 });}
 async redeem(input:ClaimLogin):ReturnType<InstallationClaimRepository['redeem']>{try{return await withPlatform(async tx=>{
  await tx.query('LOCK TABLE company IN SHARE ROW EXCLUSIVE MODE');
  const [claim]=await tx.query<{company:unknown}>(`SELECT company FROM installation_owner_claim WHERE id=$1 AND ${active} AND claimant->>'email'=$2 FOR UPDATE`,[input.claim,input.email]);
  if(!claim)return refused(tx,input.claim,'inactive_claim');
  if((await tx.query('SELECT id FROM company LIMIT 1')).length)return refused(tx,input.claim,'company_exists');
  const [proof]=await tx.query('SELECT id FROM magic_link_token WHERE id=$1 AND installation_claim_id=$2 AND email=$3 AND consumed_at IS NOT NULL AND expires_at>clock_timestamp()',[input.tokenId,input.claim,input.email]);
  if(!proof)return refused(tx,input.claim,'login_proof_missing');
  const company=CreateCompanyBody.parse(claim.company);
  const [existing]=await tx.query<{id:string}>('SELECT id FROM user_account WHERE email=$1 FOR UPDATE',[input.email]);
  if(existing&&existing.id!==input.userId)return refused(tx,input.claim,'account_changed');
  if(!existing)await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[input.userId,input.email]);
  const [identity]=await tx.query(`INSERT INTO user_identity(user_id,provider,provider_subject,email_verified) VALUES($1,'magic_link',$2,true)
   ON CONFLICT(provider,provider_subject) DO UPDATE SET email_verified=true WHERE user_identity.user_id=EXCLUDED.user_id RETURNING user_id`,[input.userId,input.email]);
  if(!identity)throw new Error('Owner identity linkage conflicted.');
  await tx.query('UPDATE user_account SET last_login_at=clock_timestamp() WHERE id=$1',[input.userId]);
  const [created]=await tx.query<{id:string}>('INSERT INTO company(name,default_region,default_industry_id) VALUES($1,$2,$3) RETURNING id',[company.name,company.defaultRegion,company.defaultIndustryId]);
  if(!created)throw new Error('Owner company insert returned no record.');
  const companyId=CompanyId(created.id);
  await tx.query("INSERT INTO company_member(company_id,user_id,role,granted_by) VALUES($1,$2,'admin',$2)",[companyId,input.userId]);
  const outboxId=await this.outbox.enqueue(tx,{operation:'touch',resource:{type:'company',id:companyId},relation:'admin',subject:{type:'user',id:input.userId}});
  // The database checks expiry again at this final transition. Failure rolls
  // back the account, company, membership and outbox together.
  await tx.query('UPDATE installation_owner_claim SET redeemed_at=clock_timestamp(),redeemed_by=$2,company_id=$3,outbox_id=$4 WHERE id=$1',[input.claim,input.userId,companyId,outboxId.toString()]);
  await tx.query("INSERT INTO audit_entry(company_id,actor_id,actor_kind,action,target,after) VALUES($1,$2,'user','InstallationOwnerClaimRedeemed',$3,$4)",[companyId,input.userId,{claimId:input.claim,companyId},{claimant:{kind:'email',email:input.email},role:'admin',sessionFingerprint:createHash('sha256').update(input.sessionId).digest('hex')}]);
  return ok({outboxId});
 });}catch(error){
  if(typeof error==='object'&&error!==null&&'constraint' in error&&error.constraint==='installation_owner_claim_redemption')return withPlatform(tx=>refused(tx,input.claim,'expired_during_redemption'));
  throw error;
 }}
}
