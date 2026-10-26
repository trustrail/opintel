import {randomBytes,createHash} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {z} from 'zod';
import {withPlatform,withPlatformAdmin} from '../db/scope.js';
import {redisKeyPrefix,type RedisClient} from '../redis/index.js';
import {ProjectId,UserId,Timestamp} from '../../shared/kernel/index.js';
import type {CurrentUser} from '../../modules/identity/index.js';
const keys=redisKeyPrefix('operator-observer');
const active=keys.key('active');
const record=z.strictObject({projectId:z.uuid().transform(ProjectId),userId:z.uuid().transform(UserId),pid:z.number().int(),lock:z.number().int().positive(),createdAt:z.number(),expiresAt:z.number()});
type RecordValue=z.infer<typeof record>;
const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex');
async function alive(value:RecordValue){
 if(Date.now()>=value.expiresAt)return false;
 return withPlatform(async tx=>(await tx.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=730501 AND objid=$1 AND pid=$2 AND granted",[value.lock,value.pid])).length===1);
}
async function revoke(client:RedisClient,key:string,value:RecordValue){
 if(await client.del(key))console.info({event:'auth.operator_observer_revoked',timestamp:new Date().toISOString(),projectId:value.projectId});
 await client.sRem(active,key);
}
/** Host-only entrypoint. No HTTP route calls this function. The advisory lock's
 * connection lifetime is the job lifetime: process death closes it and removes
 * authority immediately, independently of Redis expiry or graceful cleanup. */
export async function withOperatorObserver<T>(client:RedisClient,input:{projectId:ProjectId;ownerEmail:string;durationSeconds:number;file:string},job:()=>Promise<T>):Promise<T>{
 z.uuid().parse(input.projectId);z.email().parse(input.ownerEmail);z.number().int().min(1).max(86400).parse(input.durationSeconds);
 if(process.env.OPINTEL_DEPLOYMENT_PACKAGE!=='gateway')throw new Error('Observer creation requires the gateway-host job.');
 const user=await withPlatform(async tx=>(await tx.query<{id:string}>("SELECT u.id FROM user_account u JOIN company_member m ON m.user_id=u.id JOIN project p ON p.company_id=m.company_id WHERE u.email=$1 AND m.role='admin' AND u.last_login_at IS NOT NULL AND p.id=$2",[input.ownerEmail,input.projectId]))[0]);
 if(!user)throw new Error('The installation owner must complete normal email login first.');
 return withPlatformAdmin({actor:{kind:'system',name:'gateway-soak-observer'}},async tx=>{
  const lock=randomBytes(4).readUInt32BE(0)%2147483646+1;
  await tx.query('SELECT pg_advisory_xact_lock(730501,$1)',[lock]);
  const [backend]=await tx.query<{pid:number}>('SELECT pg_backend_pid() AS pid');if(!backend)throw new Error('Observer lifetime lock unavailable.');
  const token=randomBytes(32).toString('base64url'),key=keys.key(fingerprint(token)),createdAt=Date.now();
  const value:RecordValue={projectId:input.projectId,userId:UserId(user.id),pid:backend.pid,lock,createdAt,expiresAt:createdAt+(input.durationSeconds+300)*1000};
  await client.multi().set(key,JSON.stringify(value)).sAdd(active,key).exec();
  console.info({event:'auth.operator_observer_created',timestamp:new Date(createdAt).toISOString(),projectId:input.projectId,expiresAt:new Date(value.expiresAt).toISOString()});
  let createdFile=false;
  try{await writeFile(input.file,'opintel_observer='+token,{flag:'wx',mode:0o600});createdFile=true;return await job();}
  finally{try{await revoke(client,key,value);}finally{if(createdFile)await unlink(input.file).catch(()=>{});}}
 });
}
export function operatorObserverReader(client:RedisClient){
 async function sweep(){for(const key of await client.sMembers(active)){const raw=await client.get(key);if(!raw){await client.sRem(active,key);continue;}const parsed=record.safeParse(JSON.parse(raw) as unknown);if(parsed.success&&!await alive(parsed.data))await revoke(client,key,parsed.data);}}
 return {
  sweep,
  async read(token:string,method:string,path:string,query:URLSearchParams):Promise<CurrentUser|null>{
   if(method!=='GET'||!/^opintel_observer=[A-Za-z0-9_-]{43}$/u.test(token))return null;
   const key=keys.key(fingerprint(token.slice('opintel_observer='.length))),raw=await client.get(key);if(!raw)return null;
   const value=record.parse(JSON.parse(raw) as unknown);
   const allowed=path===`/api/v1/projects/${value.projectId}/runs`||(/^\/api\/v1\/runs\/[0-9a-f-]{36}$/u.test(path)&&query.get('projectId')===value.projectId);
   if(!allowed)return null;
   if(!await alive(value)){await revoke(client,key,value);return null;}
   const [user]=await withPlatform(tx=>tx.query<{id:string;email:string;full_name:string|null;timezone:string}>('SELECT id,email,full_name,timezone FROM user_account WHERE id=$1',[value.userId]));
   return user?{id:UserId(user.id),email:user.email,fullName:user.full_name,timezone:user.timezone,method:'operator_observer',sessionCreatedAt:Timestamp(new Date(value.createdAt)),deviceConfirmed:false}:null;
  }
 };
}
