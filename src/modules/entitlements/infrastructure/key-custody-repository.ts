import { randomUUID,createHash } from 'node:crypto';
import { withTenant,withPlatform } from '../../../platform/db/scope.js';
import { CompanyId,ProjectId,UserId,DomainError,err,type Result } from '../../../shared/kernel/index.js';
import { TokenKeyView } from '../../../shared/custody-contract.js';
import type { CustodyRepository,CustodyContext,CustodySession,KeyIntent,KeyRecord } from '../application/key-custody.js';
let custodyQueue:Promise<void>=Promise.resolve();
export class PostgresCustodyRepository implements CustodyRepository {
 async exclusive<T>(ctx:CustodyContext,work:(session:CustodySession)=>Promise<Result<T>>):Promise<Result<T>>{
  const previous=custodyQueue;let release:()=>void=()=>{};custodyQueue=new Promise<void>(resolve=>{release=resolve;});await previous;
  try{return await this.locked(ctx,work);}finally{release();}
 }
 private async locked<T>(ctx:CustodyContext,work:(session:CustodySession)=>Promise<Result<T>>):Promise<Result<T>>{
  // Hold a per-project transaction lock, but write intent/results in separate
  // tenant transactions so an HTTP loss cannot roll back the recovery record.
  return withTenant(ctx,async lock=>{
   const [locked]=await lock.query<{acquired:boolean}>('SELECT pg_try_advisory_xact_lock(hashtextextended($1,43)) AS acquired',[ctx.projectId]);if(!locked?.acquired)return err(new DomainError('conflict','Another custody operation is in progress. Retry after it finishes.'));
   const [project]=await withPlatform(tx=>tx.query<{name:string;company_id:string}>('SELECT name,company_id FROM project WHERE id=$1',[ctx.projectId]));
   if(!project)return err(new DomainError('not_found','The project does not exist.'));
   const query=<R>(sql:string,values:readonly unknown[]=[])=>withTenant(ctx,tx=>tx.query<R>(sql,values));
   const requestId=(key:string)=>{const h=createHash('sha256').update(JSON.stringify([ctx.projectId,ctx.userId,key])).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
   const s:CustodySession={project:{name:project.name,companyId:CompanyId(project.company_id)},
    keys:()=>query<KeyRecord>(`SELECT version,sentinel_token AS sentinel,state,backup_verified_at IS NOT NULL AS verified FROM token_key_version WHERE project_id=$1 ORDER BY version`,[ctx.projectId]),
    pending:async()=>{const rows=await query<KeyIntent>(`SELECT id,kind,version,sentinel_token AS sentinel,candidate_id AS "candidateId",reason,actor_id AS actor FROM token_key_operation WHERE project_id=$1 AND completed_at IS NULL`,[ctx.projectId]);return rows[0]??null;},
    operation:async key=>{const rows=await query<KeyIntent>('SELECT id,kind,version,sentinel_token AS sentinel,candidate_id AS "candidateId",reason,actor_id AS actor FROM token_key_operation WHERE id=$1 AND project_id=$2',[requestId(key),ctx.projectId]);return rows[0]??null;},
    intent:async(value,key)=>{const id=key?requestId(key):randomUUID();await query('INSERT INTO token_key_operation(id,project_id,kind,version,sentinel_token,candidate_id,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,ctx.projectId,value.kind,value.version,value.sentinel,value.candidateId,value.actor,value.reason]);return {...value,id};},
    replaceCandidate:async value=>{await query('UPDATE token_key_operation SET candidate_id=$2,sentinel_token=$3 WHERE id=$1 AND completed_at IS NULL',[value.id,value.candidateId,value.sentinel]);},
    finish:async value=>{await withTenant(ctx,async tx=>{
     if(value.kind!=='restore'){
      await tx.query("UPDATE token_key_version SET state='retired' WHERE project_id=$1 AND state='current' AND version<>$2",[ctx.projectId,value.version]);
      await tx.query("INSERT INTO token_key_version(project_id,version,sentinel_token,state,created_by,reason) VALUES($1,$2,$3,'current',$4,$5) ON CONFLICT(project_id,version) DO NOTHING",[ctx.projectId,value.version,value.sentinel,value.actor,value.reason]);
      await withPlatform(platform=>platform.query('UPDATE project SET token_key_version=$2 WHERE id=$1',[ctx.projectId,value.version]));
     }
     await tx.query('UPDATE token_key_operation SET completed_at=now() WHERE id=$1',[value.id]);
    });},
    rehearsal:async(version,outcome)=>{await query(`UPDATE token_key_version SET last_rehearsed_at=now(),last_rehearsal=$3,backup_verified_at=CASE WHEN $3='ok' THEN now() ELSE NULL END WHERE project_id=$1 AND version=$2`,[ctx.projectId,version,outcome]);},
    view:async()=>{const rows=await query<{version:number;state:string;createdAt:Date;createdBy:string|null;reason:string|null;backupVerifiedAt:Date|null;lastRehearsedAt:Date|null;lastRehearsal:string|null}>(`SELECT v.version,v.state,v.created_at AS "createdAt",v.created_by AS "createdBy",v.reason,v.backup_verified_at AS "backupVerifiedAt",v.last_rehearsed_at AS "lastRehearsedAt",v.last_rehearsal AS "lastRehearsal" FROM token_key_version v WHERE v.project_id=$1 ORDER BY version DESC`,[ctx.projectId]);const users=await withPlatform(tx=>tx.query<{id:string;email:string}>('SELECT id,email FROM user_account WHERE id=ANY($1::uuid[])',[rows.map(r=>r.createdBy).filter(Boolean)]));return TokenKeyView.parse({currentVersion:rows.find(v=>v.state==='current')?.version??null,versions:rows.map(v=>({...v,createdBy:users.find(u=>u.id===v.createdBy)??null,createdAt:v.createdAt.toISOString(),backupVerifiedAt:v.backupVerifiedAt?.toISOString()??null,lastRehearsedAt:v.lastRehearsedAt?.toISOString()??null}))});},
   };return work(s);
  });
 }
 async due(){
  const projects=await withPlatform(tx=>tx.query<{id:string;user_id:string}>(`SELECT p.id,(SELECT user_id FROM project_member WHERE project_id=p.id ORDER BY user_id LIMIT 1) AS user_id FROM project p WHERE p.token_key_version IS NOT NULL`));
  const due:CustodyContext[]=[];
  for(const p of projects){if(!p.user_id)continue;const ctx={projectId:ProjectId(p.id),userId:UserId(p.user_id)};const rows=await withTenant(ctx,tx=>tx.query('SELECT 1 FROM token_key_version WHERE last_rehearsed_at IS NULL OR last_rehearsed_at<now()-interval \'1 day\' LIMIT 1'));if(rows.length)due.push(ctx);}return due;
 }
}
