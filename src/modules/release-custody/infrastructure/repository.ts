import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {readSetting} from '../../../shared/project-settings.js';
import {ProjectId,UserId} from '../../../shared/kernel/index.js';
import {releaseClaims} from '../../../shared/release-contract.js';
import type {ReleaseContext,ReleaseRepository,ReleaseSession,StoredRelease} from '../application/ports.js';
export class PostgresReleaseRepository implements ReleaseRepository {
 constructor(private readonly projectId?:string){}
 exclusive<T>(ctx:ReleaseContext,id:string,work:(s:ReleaseSession)=>Promise<T>):Promise<T>{return withTenant(ctx,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,538))',[ctx.projectId]);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,536))',[id]);
  return work({
   get:async()=>{const [row]=await tx.query<{claims:unknown;grant_jws:string;share:Buffer|null;state:StoredRelease['state'];escrow_revoked:boolean;revocation_requested:boolean}>(`SELECT claims,grant_jws,share,state,escrow_revoked,EXISTS(SELECT 1 FROM release_event e WHERE e.grant_id=g.id AND e.kind='revoked') AS revocation_requested FROM release_grant g WHERE id=$1`,[id]);return row?{claims:releaseClaims.parse(row.claims),grant:row.grant_jws,share:row.share,state:row.state,escrowRevoked:row.escrow_revoked,revocationRequested:row.revocation_requested}:null;},
   save:async v=>{if(v.state==='granted'){const [existing]=await tx.query<{exists:boolean}>('SELECT EXISTS(SELECT 1 FROM release_grant WHERE id=$1) AS exists',[id]);if(!existing?.exists){const revoked=await tx.query("SELECT c.id FROM pool_credential c WHERE (c.custody_alias=$1 OR EXISTS(SELECT 1 FROM pool_key k WHERE k.credential_id=c.id AND k.custody_alias=$1)) AND (c.revoked_at IS NOT NULL OR (c.custody_alias<>$1 AND NOT EXISTS(SELECT 1 FROM pool_key k WHERE k.credential_id=c.id AND k.custody_alias=$1 AND k.state='retiring' AND k.grace_until>clock_timestamp() AND k.alias_retired_at IS NULL)))",[v.claims.sub]);if(revoked.length)throw new Error('Credential alias is unavailable for grant creation.');const [row]=await withPlatform(scope=>scope.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));if(readSetting(row?.settings,'custody.provider')!==v.claims.custody.provider||(v.claims.custody.provider!=='local'&&readSetting(row?.settings,'custody.tenant')!==v.claims.custody.tenant))throw new Error('Custody provider changed before grant creation.');}}await tx.query(`INSERT INTO release_grant(id,project_id,scope_user_id,receipt_id,claims,grant_jws,expires_at,share,state,escrow_revoked) VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7),$8,$9,$10) ON CONFLICT(id) DO UPDATE SET share=EXCLUDED.share,state=EXCLUDED.state,escrow_revoked=EXCLUDED.escrow_revoked`,[id,ctx.projectId,ctx.userId,v.claims.rcpt,JSON.stringify(v.claims),v.grant,v.claims.exp,v.share===null?null:Buffer.from(v.share),v.state,v.escrowRevoked]);},
   event:async e=>{await tx.query('INSERT INTO release_event(project_id,grant_id,receipt_id,kind,occurred_at,alias,actor,jur_observed) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(grant_id,kind) DO NOTHING',[ctx.projectId,e.grantId,e.receipt,e.kind,e.at,e.alias,e.actor,e.jurObserved]);},
  });
 });}
 async due(){
  // Cleanup enumerates identifiers only, including archived/memberless projects.
  // Secret shares are still read and deleted exclusively in tenant scope.
  const rows=await withPlatform(tx=>tx.query<{project_id:string;scope_user_id:string;id:string}>(
   'SELECT * FROM public.pending_release_cleanup($1)',[this.projectId??null]));
  return rows.map(row=>({ctx:{projectId:ProjectId(row.project_id),userId:UserId(row.scope_user_id)},grantId:row.id}));
 }
}
