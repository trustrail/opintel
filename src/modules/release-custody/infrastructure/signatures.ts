import {hkdfSync,createPrivateKey,createPublicKey} from 'node:crypto';
import {withTenant} from '../../../platform/db/scope.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import {releasePublicKey,type ReleaseClaims} from '../../../shared/release-contract.js';
import type {GrantSignatures,ReleaseContext,ReleaseProvider} from '../application/ports.js';
import {signGrant,verifyGrant} from './crypto.js';
/** Only version/retirement metadata and public verification keys persist. */
export class PostgresGrantSignatures implements GrantSignatures {
 constructor(private readonly provider:Pick<ReleaseProvider,'id'|'tenant'>,private readonly master=process.env.OPINTEL_CUSTODY_MASTER_KEY){}
 private key(project:string,version:string){
  if(!this.master||!/^[0-9a-f]{64}$/u.test(this.master))throw new DomainError('dependency_unavailable','Custody signing master key is not configured.',{cause:'release_configuration'});
  const master=Buffer.from(this.master,'hex'),seed=Buffer.from(hkdfSync('sha256',master,Buffer.alloc(0),Buffer.from(project.toLowerCase()+version,'utf8'),32));
  const der=Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]);
  try{return createPrivateKey({key:der,format:'der',type:'pkcs8'});}finally{master.fill(0);seed.fill(0);der.fill(0);}
 }
 private publicKey(project:string,kid:string){return releasePublicKey.parse({...createPublicKey(this.key(project,kid)).export({format:'jwk'}),kid,alg:'EdDSA',use:'sig'});}
 private async keys(ctx:ReleaseContext){return withTenant(ctx,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,537))',[ctx.projectId]);
  let rows=await tx.query<{kid:string;public_key:unknown;retired_at:Date|null}>('SELECT kid,public_key,retired_at FROM release_signing_key WHERE project_id=$1 AND (retired_at IS NULL OR verify_until>clock_timestamp())',[ctx.projectId]);
  if(!rows.some(r=>r.retired_at===null)){
   const [next]=await tx.query<{version:string}>("SELECT (COALESCE(max(kid::bigint) FILTER(WHERE kid ~ '^[0-9]+$'),0)+1)::text AS version FROM release_signing_key WHERE project_id=$1",[ctx.projectId]);
   const kid=next!.version,publicKey=this.publicKey(ctx.projectId,kid);
   await tx.query('INSERT INTO release_signing_key(project_id,kid,public_key) VALUES($1,$2,$3)',[ctx.projectId,kid,JSON.stringify(publicKey)]);
   rows=[...rows,{kid,public_key:publicKey,retired_at:null}];
  }
  return rows.map(row=>({...row,public_key:/^[0-9]+$/u.test(row.kid)?this.publicKey(ctx.projectId,row.kid):releasePublicKey.parse(row.public_key)}));
 });}
 async sign(ctx:ReleaseContext,claims:ReleaseClaims){const rows=await this.keys(ctx),row=rows.find(r=>r.retired_at===null);if(!row)throw new Error('Release signing key unavailable.');return signGrant(claims,row.kid,this.key(ctx.projectId,row.kid));}
 async verify(ctx:ReleaseContext,grant:string){try{const rows=await this.keys(ctx);const claims=verifyGrant(grant,kid=>{const row=rows.find(r=>r.kid===kid);return row?createPublicKey({key:row.public_key,format:'jwk'}):undefined;});return claims.iss===ctx.projectId?ok(claims):err(new DomainError('forbidden','Invalid release grant.'));}catch{return err(new DomainError('forbidden','Invalid release grant.'));}}
 async describe(ctx:ReleaseContext){const rows=await this.keys(ctx);return {provider:this.provider.id,tenant:this.provider.tenant,credentialRequired:true as const,keys:rows.map(row=>row.public_key)};}
 async rotate(ctx:ReleaseContext,maxGrantTtlSeconds:number){
  await this.keys(ctx);
  await withTenant(ctx,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,537))',[ctx.projectId]);
   const [next]=await tx.query<{version:string}>("SELECT (COALESCE(max(kid::bigint) FILTER(WHERE kid ~ '^[0-9]+$'),0)+1)::text AS version FROM release_signing_key WHERE project_id=$1",[ctx.projectId]);
   const kid=next!.version,publicKey=this.publicKey(ctx.projectId,kid);
   await tx.query("UPDATE release_signing_key SET retired_at=clock_timestamp(),verify_until=GREATEST(clock_timestamp()+$2*interval '1 second',(SELECT max(expires_at) FROM release_grant WHERE project_id=$1)) WHERE project_id=$1 AND retired_at IS NULL",[ctx.projectId,maxGrantTtlSeconds]);
   await tx.query('INSERT INTO release_signing_key(project_id,kid,public_key) VALUES($1,$2,$3)',[ctx.projectId,kid,JSON.stringify(publicKey)]);
   await tx.query("INSERT INTO audit_entry(project_id,actor_id,actor_kind,action,target,after) VALUES($1,$2,'user','CustodySigningKeyRotated',$3,$4)",[ctx.projectId,ctx.userId,{projectId:ctx.projectId},{kid}]);
  });
  return this.describe(ctx);
 }
}
