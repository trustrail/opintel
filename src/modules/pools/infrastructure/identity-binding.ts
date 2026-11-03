import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {withTenant,withPlatform,type Tx} from '../../../platform/db/scope.js';
import {DomainError,err,ok,type PoolId,type Result} from '../../../shared/kernel/index.js';
import type {IdentityEnrollment} from '../../../shared/api/credential-identity.js';
import type {CredentialBindings,PresentedIdentity,EnrollmentEscrow} from '../application/identity-binding.js';
import type {PoolKeyContext} from '../application/keys.js';
import type {CredentialId} from '../domain/pool.js';
type Binding={label:string;credential_kind:'identity-bound'|'bearer-only';binding_status:'unbound'|'pending'|'bound'|'reset';certificate_fingerprint:string|null;enrollment_recipient_identifier:string|null;recipient_identifier:string|null;revoked_at:Date|null;enrollment_challenge:unknown};
async function audit(tx:Tx,ctx:PoolKeyContext,id:CredentialId,action:string,after:Record<string,string>,actor:'user'|'system'){
 await tx.query('INSERT INTO audit_entry(project_id,actor_id,actor_kind,action,target,after) VALUES($1,$2,$3,$4,$5,$6)',[ctx.projectId,actor==='user'?ctx.userId:null,actor,action,{credentialId:id},after]);
}
const StoredChallenge=z.strictObject({id:z.uuid(),fingerprint:z.string(),recipient:z.string(),digest:z.string().regex(/^[0-9a-f]{64}$/u),expiresAt:z.string()});
const nonceDigest=(nonce:Uint8Array)=>createHash('sha256').update(nonce).digest();
export class PostgresCredentialBindings implements CredentialBindings{
 constructor(private readonly escrow?:EnrollmentEscrow){}

 authenticate(ctx:PoolKeyContext,pool:PoolId,id:CredentialId,certificate:PresentedIdentity|undefined,enrollment:IdentityEnrollment|undefined):Promise<Result<void>>{
  return withTenant(ctx,async tx=>{
   await tx.query('SELECT id FROM pool WHERE id=$1 FOR UPDATE',[pool]);
   const [row]=await tx.query<Binding>('SELECT * FROM pool_credential WHERE id=$1 AND pool_id=$2 FOR UPDATE',[id,pool]);
   if(!row||row.revoked_at)return err(new DomainError('unauthenticated','This credential is not active.'));
   const refuse=async(message:string,cause='identity_mismatch')=>{await audit(tx,ctx,id,'CredentialIdentityRefused',{cause},'system');return err(new DomainError('unauthenticated',message,{cause}));};
   if(row.credential_kind==='bearer-only'){
    if((await tx.query("SELECT 1 FROM entitlement WHERE pool_id=$1 AND treatment='custody' LIMIT 1",[pool])).length)return refuse('Bearer-only credentials cannot access a pool with custody columns.');
    return ok(undefined);
   }
   if(!certificate)return refuse('This identity-bound credential requires a client certificate.');
   if(row.certificate_fingerprint!==null){
    if(row.certificate_fingerprint!==certificate.fingerprint)return refuse('The client certificate does not match this credential binding.');
    if(enrollment&&enrollment.recipientIdentifier!==row.recipient_identifier)return refuse('The XQ recipient does not match this credential binding.');
    if(row.binding_status==='pending')return refuse('An administrator must approve this identity binding.','identity_pending');
    return row.binding_status==='bound'?ok(undefined):refuse('The credential identity must be enrolled again.');
   }
   if(!enrollment)return refuse('Initialize with the device labels and XQ recipient identifier to bind this credential.');
   if(row.enrollment_recipient_identifier!==null&&row.enrollment_recipient_identifier!==enrollment.recipientIdentifier)return refuse('The XQ recipient does not match the recipient already associated with this credential.');
   const stored=StoredChallenge.safeParse(row.enrollment_challenge),proof=enrollment.proof;
   if(proof){
    // Consume even an invalid proof. A challenge is tied to both identities and
    // checked while holding the credential lock; no concurrent replay can bind.
    await tx.query('UPDATE pool_credential SET enrollment_challenge=NULL WHERE id=$1',[id]);
    const nonce=Buffer.from(proof.nonce,'base64url');
    const valid=stored.success&&stored.data.id===proof.id&&stored.data.fingerprint===certificate.fingerprint&&stored.data.recipient===enrollment.recipientIdentifier&&Date.parse(stored.data.expiresAt)>Date.now()&&timingSafeEqual(Buffer.from(stored.data.digest,'hex'),nonceDigest(nonce));nonce.fill(0);
    if(!valid)return refuse('The XQ enrollment challenge was not proven. No identity was bound.','identity_unproven');
   }else{
    // Every unanswered challenge is a refused enrollment, including a caller
    // that never comes back. Only a hash persists; the nonce exists at XQ.
    if(stored.success&&Date.parse(stored.data.expiresAt)>Date.now())return refuse('The outstanding XQ enrollment challenge has not been proven.','identity_unproven');
    if(!this.escrow)return refuse('XQ enrollment is unavailable. No identity was bound.','identity_unproven');
    const nonce=randomBytes(32),challengeId=randomUUID(),ttl=120,expiresAt=new Date(Date.now()+ttl*1000).toISOString();
    try{
     const locator=await this.escrow.escrowEnrollment(ctx,nonce,enrollment.recipientIdentifier,ttl);
     await tx.query('UPDATE pool_credential SET enrollment_challenge=$2 WHERE id=$1',[id,{id:challengeId,fingerprint:certificate.fingerprint,recipient:enrollment.recipientIdentifier,digest:nonceDigest(nonce).toString('hex'),expiresAt}]);
     await audit(tx,ctx,id,'CredentialIdentityRefused',{cause:'identity_unproven',challengeId},'system');
     return err(new DomainError('unauthenticated','Redeem the one-time XQ enrollment challenge before this identity can bind.',{cause:'identity_unproven',challenge:{id:challengeId,locator,expiresAt}}));
    }catch{return refuse('XQ enrollment escrow failed. No identity was bound.','identity_unproven');}
    finally{nonce.fill(0);}
   }
   const [project]=await withPlatform(scope=>scope.query<{settings:{approveIdentityBindings?:boolean}}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));
   if(!project)return refuse('The project is unavailable.');
   const pending=project.settings.approveIdentityBindings===true,status=pending?'pending':'bound';
   await tx.query(`UPDATE pool_credential SET certificate_fingerprint=$2,certificate_subject=$3,binding_status=$4,bound_at=CASE WHEN $4='bound' THEN clock_timestamp() ELSE NULL END,
    certificate_id=$5,device_name=$6,recipient_identifier=$7,identity_kind='certificate',association_status='associated',association_recorded_at=clock_timestamp()
    WHERE id=$1`,[id,certificate.fingerprint,certificate.subject,status,enrollment.certificateId,enrollment.deviceName,enrollment.recipientIdentifier]);
   await audit(tx,ctx,id,pending?'CredentialIdentityPending':'CredentialIdentityBound',{fingerprint:certificate.fingerprint,status},'system');
   return pending?refuse('An administrator must approve this identity binding.','identity_pending'):ok(undefined);
  });
 }
 change(ctx:PoolKeyContext,pool:PoolId,id:CredentialId,action:'approve'|'reset',confirmation:string):Promise<Result<void>>{
  return withTenant(ctx,async tx=>{
   await tx.query('SELECT id FROM pool WHERE id=$1 FOR UPDATE',[pool]);
   const [row]=await tx.query<Binding>('SELECT * FROM pool_credential WHERE id=$1 AND pool_id=$2 FOR UPDATE',[id,pool]);
   if(!row||row.revoked_at)return err(new DomainError('not_found','The active credential was not found.'));
   if(row.credential_kind!=='identity-bound')return err(new DomainError('validation_failed','Bearer-only credentials have no certificate binding.'));
   if(confirmation!==row.label)return err(new DomainError('validation_failed','Type the credential label exactly to confirm.'));
   if(action==='approve'){
    if(row.binding_status!=='pending')return err(new DomainError('conflict','This identity binding is not pending approval.'));
    await tx.query("UPDATE pool_credential SET binding_status='bound',bound_at=clock_timestamp() WHERE id=$1",[id]);
   }else{
    await tx.query(`UPDATE pool_credential SET enrollment_challenge=NULL,binding_status='reset',certificate_fingerprint=NULL,certificate_subject=NULL,bound_at=NULL,enrollment_recipient_identifier=NULL,
     certificate_id=NULL,device_name=NULL,recipient_identifier=NULL,identity_kind=NULL,association_status=NULL,association_recorded_at=NULL WHERE id=$1`,[id]);
   }
   await audit(tx,ctx,id,action==='approve'?'CredentialIdentityApproved':'CredentialIdentityReset',{previousFingerprint:row.certificate_fingerprint??'',status:action==='approve'?'bound':'reset'},'user');return ok(undefined);
  });
 }
}
