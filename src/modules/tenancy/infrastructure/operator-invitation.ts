import {randomBytes,createHash} from 'node:crypto';
import {withPlatform} from '../../../platform/db/scope.js';
import {MailOutbox,type MailPort} from '../../../platform/mail/index.js';
import {DomainError,err,ok,type UserId,type CompanyId} from '../../../shared/kernel/index.js';
import {OutboxInvitationDelivery} from './invitation-delivery.js';
import type {InvitationDispatch} from '../application/invitations.js';
/** Explicit gateway-host company invitation, never an automatic membership. */
export async function inviteCompanyMember(input:{email:string;role:'admin'|'member';companyId:CompanyId;actorId:UserId},mail:MailPort){
 const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest(),outbox=new MailOutbox();
 const result=await withPlatform(async tx=>{
  const [company]=await tx.query<{allowed_domains:string[];sso_enforced:boolean}>('SELECT allowed_domains,sso_enforced FROM company WHERE id=$1 FOR SHARE',[input.companyId]);
  if(!company)return err(new DomainError('not_found','The installation company does not exist.'));
  if(!(await tx.query("SELECT 1 FROM company_member WHERE company_id=$1 AND user_id=$2 AND role='admin'",[input.companyId,input.actorId])).length)return err(new DomainError('forbidden','Company administrator required.'));
  if(company.allowed_domains.length&&!company.allowed_domains.includes(input.email.split('@').at(-1)!.toLowerCase()))return err(new DomainError('forbidden','This email domain is not allowed by the company.'));
  if((await tx.query('SELECT 1 FROM company_member m JOIN user_account u ON u.id=m.user_id WHERE m.company_id=$1 AND u.email=$2',[input.companyId,input.email])).length)return err(new DomainError('conflict','This person is already a company member.'));
  const [invite]=await tx.query<{id:string}>("INSERT INTO pending_invite(email,company_id,project_id,role,company_role,token_hash,expires_at,created_by) VALUES($1,$2,NULL,CASE WHEN $3='admin' THEN 'admin' ELSE 'viewer' END,$3,$4,now()+interval '7 days',$5) RETURNING id",[input.email,input.companyId,input.role,hash,input.actorId]);if(!invite)throw new Error('Invitation creation returned no record.');
  let delivery:InvitationDispatch;
  if(company.sso_enforced){
   const providers=await tx.query<{provider:string}>('SELECT provider FROM company_idp WHERE company_id=$1 AND enabled',[input.companyId]);if(providers.length!==1)throw new DomainError('dependency_unavailable','The company identity provider is unavailable.');
   const {InviteId}=await import('../../../shared/kernel/index.js');
   await outbox.enqueue(tx,{to:input.email,template:'invitation',vars:{provider:providers[0]!.provider,companyId:input.companyId,inviteId:invite.id},idempotencyKey:'invitation:'+invite.id});delivery={kind:'oidc',invitationId:InviteId(invite.id)};
  }else{
   const [link]=await tx.query<{id:string}>("INSERT INTO magic_link_token(email,token_hash,device_nonce,invite_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days') RETURNING id",[input.email,hash,randomBytes(32).toString('base64url'),invite.id]);if(!link)throw new Error('Invitation link creation returned no record.');
   await outbox.enqueue(tx,{to:input.email,template:'magic_link',vars:{tokenId:link.id},idempotencyKey:'magic_link:'+link.id});delivery={kind:'magic_link',tokenId:link.id,token};
  }
  await tx.query("INSERT INTO audit_entry(company_id,actor_id,actor_kind,action,target,after) VALUES($1,$2,'user','CompanyInvitationCreated',$3,$4)",[input.companyId,input.actorId,{invitationId:invite.id},{role:input.role,authority:'gateway_host'}]);
  return ok({id:invite.id,delivery});
 });
 if(!result.ok)return result;
 console.info({event:'auth.invitation_created',timestamp:new Date().toISOString(),companyId:input.companyId,invitationId:result.value.id,role:input.role});
 try{await new OutboxInvitationDelivery(outbox,mail).dispatch(result.value.delivery);}catch{return err(new DomainError('dependency_unavailable','The invitation was saved, but mail delivery failed.'));}
 return ok({id:result.value.id});
}
