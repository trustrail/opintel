import {auditPoolBudgets} from './budgets.js';
import {matchesObservedRecipient,type CertificateAssociation} from '../../../shared/api/certificate-association.js';
import {PostgresPoolTables} from './tables.js';
import { createHash, randomUUID } from 'node:crypto';
import { withPlatform, withTenant, type Tx } from '../../../platform/db/scope.js';
import { DomainError, err, ok, Timestamp, SystemClock, type Clock, type PoolId, type Result } from '../../../shared/kernel/index.js';
import { PoolKeyGraceSeconds, PoolKeyStored, PoolKeyCreationResponse, type PoolKeyMetadata } from '../../../shared/api/pool-keys.js';
import type { CredentialRevocationPort, AgentPresenceQuery, KeyCommand, PoolKeyContext, PoolKeyRepository } from '../application/keys.js';
import {CredentialId, type PoolKeyId } from '../domain/pool.js';
import { generatePoolKey, hashPoolKey } from './key-material.js';
type KeyRow={credential_id:CredentialId;label:string;custody_alias:string;id:PoolKeyId;pool_id:PoolId;key_prefix:string;state:PoolKeyMetadata['state'];grace_until:Date|null;created_at:Date};
const columns='id,pool_id,key_prefix,state,grace_until,created_at,custody_alias,credential_id,(SELECT label FROM pool_credential c WHERE c.id=credential_id) AS label';
function metadata(row:KeyRow,now:Date):PoolKeyMetadata {
 return {credentialId:row.credential_id,label:row.label,custodyAlias:row.custody_alias,poolId:row.pool_id,keyVersion:row.id,prefix:row.key_prefix,state:row.state==='retiring'&&row.grace_until!==null&&row.grace_until<=now?'expired':row.state,graceUntil:row.grace_until?.toISOString()??null,createdAt:row.created_at.toISOString()};
}
export class PostgresPoolKeys implements PoolKeyRepository {
 constructor(private readonly clock:Clock=new SystemClock(),private readonly provisionAlias?:(ctx:PoolKeyContext,alias:string)=>Promise<void>,private readonly revocation?:CredentialRevocationPort,private readonly tables=new PostgresPoolTables()) {}
 async inspect(ctx:PoolKeyContext,pool:PoolId,key:PoolKeyId):Promise<Result<PoolKeyMetadata>> {
  return withTenant(ctx,async tx=>{
   const [row]=await tx.query<KeyRow>(`SELECT ${columns} FROM pool_key WHERE pool_id=$1 AND id=$2`,[pool,key]);
   return row?ok(metadata(row,new Date(this.clock.now()))):err(new DomainError('not_found','The pool key was not found in this project.'));
  });
 }
 async execute(ctx:PoolKeyContext,command:KeyCommand,key:string,presence:AgentPresenceQuery):Promise<Result<PoolKeyCreationResponse|PoolKeyStored>> {
  const [project]=await withPlatform(tx=>tx.query<{settings:Record<string,unknown>}>('SELECT settings FROM project WHERE id=$1 AND archived_at IS NULL',[ctx.projectId]));
  if(!project)return err(new DomainError('not_found','The project was not found.'));
  const grace=PoolKeyGraceSeconds.safeParse(project.settings.poolKeyGraceSeconds);
  if(!grace.success)return err(new DomainError('validation_failed','The pool key grace window must be between one hour and seven days.'));
  const route=command.kind==='create'?`/projects/${ctx.projectId}/pools`:`/pools/${command.poolId}/keys/${command.kind}`;
  const bodyHash=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  const bindingOutbox:bigint[]=[];
  const result=await withTenant(ctx,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,538))',[ctx.projectId]);
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([ctx.projectId,ctx.userId,route,key])]);
   const [prior]=await tx.query<{body_hash:string;response:unknown}>('SELECT body_hash,response FROM pool_key_request WHERE actor_id=$1 AND route=$2 AND request_key=$3 AND expires_at>clock_timestamp()',[ctx.userId,route,key]);
   if(prior)return prior.body_hash===bodyHash?ok(PoolKeyStored.parse(prior.response)):err(new DomainError('idempotency_key_reused','This Idempotency-Key was used with a different key command.'));
   let pool:PoolId;
   let stored:PoolKeyStored;
   let plaintext:string|undefined;
   if(command.kind==='create'){
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([ctx.projectId,'pool-name',command.name.toLowerCase()])]);
    const [existing]=await tx.query('SELECT id FROM pool WHERE lower(name)=lower($1)',[command.name]);
    if(existing)return err(new DomainError('conflict','A pool with this name already exists.'));
    const prepared=command.tableSetup?await this.tables.prepare(tx,command.tableSetup):undefined;if(prepared&&!prepared.ok)return prepared;
    const [created]=await tx.query<{id:PoolId}>('INSERT INTO pool(project_id,name,budgets) VALUES($1,$2,$3) RETURNING id',[ctx.projectId,command.name,command.budgets??{}]);
    if(!created)throw new Error('Pool insert returned no row.');
    pool=created.id;
    if(command.budgets&&Object.keys(command.budgets).length)await auditPoolBudgets(tx,ctx,pool,{},command.budgets);
    let boundTables:PoolKeyMetadata['tables'];
    if(prepared?.ok){await tx.query('UPDATE pool SET tables_explicit=true,table_setup=$2 WHERE id=$1',[pool,JSON.stringify({rowRule:prepared.value.setup.rowRule,startingMode:prepared.value.setup.startingMode})]);const bound=await this.tables.apply(tx,ctx,pool,prepared.value);boundTables=bound.tables;bindingOutbox.push(...bound.outbox);}
    plaintext=generatePoolKey();
    stored={...await this.insert(tx,ctx,pool,plaintext,undefined,command.name,command.certificateAssociation),...boundTables?{tables:boundTables}:{},keyShown:false};
   }else{
    pool=command.poolId;
    const [record]=await tx.query<{name:string}>('SELECT name FROM pool WHERE id=$1 FOR UPDATE',[pool]);
    if(!record)return err(new DomainError('not_found','The pool was not found in this project.'));
    // Read the clock after obtaining the lock: time spent waiting is not grace.
    const now=new Date(this.clock.now());
    if(command.kind==='issue'){
     if(!command.label.trim()||command.label.length>80)return err(new DomainError('validation_failed','A credential label must contain 1 to 80 characters.'));
     plaintext=generatePoolKey();stored={...await this.insert(tx,ctx,pool,plaintext,undefined,command.label.trim(),command.certificateAssociation),keyShown:false};
    }else if(command.kind==='revokeCredential'){
     const [credential]=await tx.query<{id:CredentialId;label:string;custody_alias:string;revoked_at:Date|null}>('SELECT * FROM pool_credential WHERE id=$1 AND pool_id=$2 FOR UPDATE',[command.credentialId,pool]);
     if(!credential)return err(new DomainError('not_found','The credential was not found in this pool.'));
     if(credential.revoked_at)return err(new DomainError('conflict','This credential is already revoked.'));
     if(command.confirmation!==credential.label)return err(new DomainError('validation_failed','Type the credential label exactly to confirm revocation.'));
     const versions=await tx.query<KeyRow>(`SELECT ${columns} FROM pool_key WHERE credential_id=$1 ORDER BY created_at DESC,id DESC`,[credential.id]);
     const aliases=[...new Set([credential.custody_alias,...versions.map(v=>v.custody_alias)])];
     if(this.revocation){const revoked=await this.revocation.revokeInScope(tx,ctx,aliases,command.confirmedLiveGrants,'credential revoked');if(!revoked.ok)return revoked;}
     else if((await tx.query("SELECT id FROM release_grant WHERE claims->>'sub'=ANY($1::text[]) AND expires_at>clock_timestamp() AND NOT escrow_revoked",[aliases])).length)return err(new DomainError('dependency_unavailable','Credential custody cleanup is unavailable.'));
     // The scope-grant revocation hook attaches to this same lifecycle boundary
     // when row scoping is implemented; agents never mutate those grants.
     await tx.query('UPDATE pool_credential SET revoked_at=$2 WHERE id=$1',[credential.id,now]);
     await tx.query("UPDATE pool_key SET state='revoked',grace_until=NULL WHERE credential_id=$1 AND state IN ('current','retiring')",[credential.id]);
     stored={poolId:pool,credentialId:credential.id,label:credential.label,custodyAlias:credential.custody_alias,state:'revoked',keyShown:false};
    }else if(command.kind==='rotate'){
     const credentials=await tx.query<{id:CredentialId;revoked_at:Date|null}>('SELECT id,revoked_at FROM pool_credential WHERE pool_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY id FOR UPDATE',[pool,command.credentialId??null]);
     if(credentials.length>1)return err(new DomainError('validation_failed','Choose the credential to rotate.'));
     const credential=credentials[0];
     if(credential?.revoked_at)return err(new DomainError('conflict','A revoked credential cannot be rotated.'));
     if(!credential&&command.credentialId)return err(new DomainError('not_found','The credential was not found in this pool.'));
     const credentialId=credential?.id??null;

     const [retiring]=await tx.query<KeyRow>(`SELECT ${columns} FROM pool_key WHERE pool_id=$1 AND credential_id=$2 AND state='retiring'`,[pool,credentialId]);
     if(retiring&&retiring.grace_until!==null&&retiring.grace_until>now)return err(new DomainError('conflict',`Key ${retiring.id} is retiring until ${retiring.grace_until.toISOString()}. Revoke that key explicitly before rotating again.`,{keyVersion:retiring.id,graceUntil:retiring.grace_until.toISOString()}));
     await tx.query("UPDATE pool_key SET state='expired' WHERE pool_id=$1 AND state='retiring' AND grace_until<=$2 AND credential_id=$3",[pool,now,credentialId]);
     await tx.query("UPDATE pool_key SET state='retiring',grace_until=$2 WHERE pool_id=$1 AND state='current' AND credential_id=$3",[pool,new Date(now.getTime()+grace.data*1000),credentialId]);
     plaintext=generatePoolKey();
     stored={...await this.insert(tx,ctx,pool,plaintext,credentialId??undefined,record.name),keyShown:false};
    }else{
     if(command.confirmation!==record.name)return err(new DomainError('validation_failed','Type the pool name exactly to confirm revocation.'));
     const [target]=await tx.query<KeyRow>(`SELECT ${columns} FROM pool_key WHERE pool_id=$1 AND id=$2`,[pool,command.keyVersion]);
     if(!target)return err(new DomainError('not_found','The named key version was not found in this pool.'));
     if(!['current','retiring'].includes(metadata(target,now).state))return err(new DomainError('conflict','This key version is already revoked or expired.'));
     const affected=await (presence.affectedInScope
      ? presence.affectedInScope(tx,pool,command.keyVersion,project.settings,Timestamp(now))
      : presence.affected(ctx,pool,command.keyVersion));if(!affected.ok)return affected;
     const [revoked]=await tx.query<KeyRow>(`UPDATE pool_key SET state='revoked',grace_until=NULL WHERE id=$1 RETURNING ${columns}`,[command.keyVersion]);
     if(!revoked)throw new Error('Key revocation returned no row.');
     stored={...metadata(revoked,now),keyShown:false,...affected.value};
    }
   }
   // Explicit schema excludes credentials. Never persist the outward response.
   const receipt=PoolKeyStored.parse(stored);
   await tx.query(`INSERT INTO pool_key_request(project_id,actor_id,route,request_key,body_hash,response,expires_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,clock_timestamp()+interval '24 hours')
    ON CONFLICT(project_id,actor_id,route,request_key) DO UPDATE SET body_hash=EXCLUDED.body_hash,response=EXCLUDED.response,expires_at=EXCLUDED.expires_at`,[ctx.projectId,ctx.userId,route,key,bodyHash,JSON.stringify(receipt)]);
   return ok(plaintext===undefined?receipt:PoolKeyCreationResponse.parse({...receipt,keyShown:true,key:plaintext}));
  });
  await this.tables.dispatch(bindingOutbox);
  return result;
 }
 private async insert(tx:Tx,ctx:PoolKeyContext,pool:PoolId,plaintext:string,credentialId?:CredentialId,label='Agent',association?:CertificateAssociation):Promise<PoolKeyMetadata>{
  const now=new Date(this.clock.now()),id=randomUUID();
  let created=false;
  if(!credentialId){credentialId=CredentialId(id);await tx.query('INSERT INTO pool_credential(id,pool_id,project_id,label,custody_alias) VALUES($1,$2,$3,$4,$5)',[credentialId,pool,ctx.projectId,label,`agent:${ctx.projectId}:${credentialId}`]);created=true;}
  if(created&&association){
   await tx.query("UPDATE pool_credential SET certificate_id=$2,device_name=$3,recipient_identifier=$4,identity_kind='certificate',association_status='associated',association_recorded_at=clock_timestamp() WHERE id=$1",[credentialId,association.certificateId,association.deviceName,association.recipientIdentifier]);
   if(!matchesObservedRecipient(association))await tx.query("INSERT INTO audit_entry(project_id,actor_id,actor_kind,action,target,after) VALUES($1,$2,'user','CredentialCertificateRecipientWarning',$3,$4)",[ctx.projectId,ctx.userId,{credentialId},{severity:'warning',reason:'observed_pattern_mismatch',accepted:true}]);
  }
  const [row]=await tx.query<KeyRow>(`INSERT INTO pool_key(id,pool_id,project_id,key_hash,key_prefix,state,created_at,created_by,credential_id)
   VALUES($7,$1,$2,$3,$4,'current',$5,$6,$8) RETURNING ${columns}`,[pool,ctx.projectId,hashPoolKey(plaintext),plaintext.slice(0,16),now,ctx.userId,id,credentialId]);
  if(!row)throw new Error('Key insert returned no row.');
  if(created)await this.provisionAlias?.(ctx,row.custody_alias);
  return metadata(row,now);
 }
}
