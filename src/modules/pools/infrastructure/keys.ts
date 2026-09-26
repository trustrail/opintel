import { createHash } from 'node:crypto';
import { withPlatform, withTenant, type Tx } from '../../../platform/db/scope.js';
import { DomainError, err, ok, SystemClock, type Clock, type PoolId, type Result } from '../../../shared/kernel/index.js';
import { PoolKeyGraceSeconds, PoolKeyStored, type PoolKeyCreationResponse, type PoolKeyMetadata } from '../../../shared/api/pool-keys.js';
import type { AgentPresenceQuery, KeyCommand, PoolKeyContext, PoolKeyRepository } from '../application/keys.js';
import type { PoolKeyId } from '../domain/pool.js';
import { generatePoolKey, hashPoolKey } from './key-material.js';
type KeyRow={id:PoolKeyId;pool_id:PoolId;key_prefix:string;state:PoolKeyMetadata['state'];grace_until:Date|null;created_at:Date};
const columns='id,pool_id,key_prefix,state,grace_until,created_at';
function metadata(row:KeyRow,now:Date):PoolKeyMetadata {
 return {poolId:row.pool_id,keyVersion:row.id,prefix:row.key_prefix,state:row.state==='retiring'&&row.grace_until!==null&&row.grace_until<=now?'expired':row.state,graceUntil:row.grace_until?.toISOString()??null,createdAt:row.created_at.toISOString()};
}
export class PostgresPoolKeys implements PoolKeyRepository {
 constructor(private readonly clock:Clock=new SystemClock()) {}
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
  return withTenant(ctx,async tx=>{
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
    const [created]=await tx.query<{id:PoolId}>('INSERT INTO pool(project_id,name) VALUES($1,$2) RETURNING id',[ctx.projectId,command.name]);
    if(!created)throw new Error('Pool insert returned no row.');
    pool=created.id;
    plaintext=generatePoolKey();
    stored={...await this.insert(tx,ctx,pool,plaintext),keyShown:false};
   }else{
    pool=command.poolId;
    const [record]=await tx.query<{name:string}>('SELECT name FROM pool WHERE id=$1 FOR UPDATE',[pool]);
    if(!record)return err(new DomainError('not_found','The pool was not found in this project.'));
    // Read the clock after obtaining the lock: time spent waiting is not grace.
    const now=new Date(this.clock.now());
    if(command.kind==='rotate'){
     const [retiring]=await tx.query<KeyRow>(`SELECT ${columns} FROM pool_key WHERE pool_id=$1 AND state='retiring'`,[pool]);
     if(retiring&&retiring.grace_until!==null&&retiring.grace_until>now)return err(new DomainError('conflict',`Key ${retiring.id} is retiring until ${retiring.grace_until.toISOString()}. Revoke that key explicitly before rotating again.`,{keyVersion:retiring.id,graceUntil:retiring.grace_until.toISOString()}));
     await tx.query("UPDATE pool_key SET state='expired' WHERE pool_id=$1 AND state='retiring' AND grace_until<=$2",[pool,now]);
     await tx.query("UPDATE pool_key SET state='retiring',grace_until=$2 WHERE pool_id=$1 AND state='current'",[pool,new Date(now.getTime()+grace.data*1000)]);
     plaintext=generatePoolKey();
     stored={...await this.insert(tx,ctx,pool,plaintext),keyShown:false};
    }else{
     if(command.confirmation!==record.name)return err(new DomainError('validation_failed','Type the pool name exactly to confirm revocation.'));
     const [target]=await tx.query<KeyRow>(`SELECT ${columns} FROM pool_key WHERE pool_id=$1 AND id=$2`,[pool,command.keyVersion]);
     if(!target)return err(new DomainError('not_found','The named key version was not found in this pool.'));
     if(!['current','retiring'].includes(metadata(target,now).state))return err(new DomainError('conflict','This key version is already revoked or expired.'));
     const affected=await presence.affected(ctx,pool,command.keyVersion);if(!affected.ok)return affected;
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
   return ok(plaintext===undefined?receipt:{...receipt,keyShown:true,key:plaintext});
  });
 }
 private async insert(tx:Tx,ctx:PoolKeyContext,pool:PoolId,plaintext:string):Promise<PoolKeyMetadata>{
  const now=new Date(this.clock.now());
  const [row]=await tx.query<KeyRow>(`INSERT INTO pool_key(pool_id,project_id,key_hash,key_prefix,state,created_at,created_by)
   VALUES($1,$2,$3,$4,'current',$5,$6) RETURNING ${columns}`,[pool,ctx.projectId,hashPoolKey(plaintext),plaintext.slice(0,16),now,ctx.userId]);
  if(!row)throw new Error('Key insert returned no row.');
  return metadata(row,now);
 }
}
