import {operatorDiagnostic} from './diagnostics.js';
import {readFile,open,rename,lstat,mkdir,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {z} from 'zod';
import {RegionSchema} from '../../src/shared/api/tenancy-schemas.js';
import {CompanyId,UserId,ProjectId,SystemClock,type Result} from '../../src/shared/kernel/index.js';
import {withPlatform} from '../../src/platform/db/scope.js';
import {SpiceDbAuthorizationPort} from '../../src/modules/authz/infrastructure/spicedb-authorization-port.js';
export const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
export const required=(name:string)=>{const value=process.env[name];if(!value)throw new OperatorConflict('Missing operator setting: '+name);return value;};
export async function privateRead(file:string){const st=await lstat(file);if(!st.isFile()||(st.mode&0o077))throw new OperatorConflict('Private input must be a regular mode-600 file');return readFile(file,'utf8');}
export async function privateWrite(file:string,value:unknown){await mkdir(dirname(file),{recursive:true,mode:0o700});const next=file+'.next';const handle=await open(next,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}await rename(next,file);}
export async function locked<T>(file:string,work:()=>Promise<T>){await mkdir(dirname(file),{recursive:true,mode:0o700});const lock=await open(file+'.lock','wx',0o600);try{return await work();}finally{await lock.close();await unlink(file+'.lock');}}
export const operatorConfig=z.strictObject({ownerEmail:z.email(),companyId:z.uuid(),projectName:z.string().min(1).max(80),region:RegionSchema,engine:z.strictObject({name:z.string().min(1),address:z.url(),certificatePin:z.string()}),sourceCredentialRef:z.string().startsWith('secret://'),settings:z.record(z.string(),z.unknown())});
export async function context(){
 if(process.env.OPINTEL_DEPLOYMENT_PACKAGE!=='gateway')throw new OperatorConflict('Use the gateway package operator job');
 const config=operatorConfig.parse(JSON.parse(await privateRead(required('OPINTEL_OPERATOR_CONFIG'))));
 const users=await withPlatform(tx=>tx.query<{id:string}>('SELECT u.id FROM user_account u JOIN company_member m ON m.user_id=u.id WHERE u.email=$1 AND m.company_id=$2 AND m.role=\'admin\'',[config.ownerEmail,config.companyId]));
 if(users.length!==1)throw new OperatorConflict('Existing company administrator required; complete normal owner login first');
 const actor=process.env.OPINTEL_CUSTOMER_JOB==='1'?{id:users[0]!.id,email:config.ownerEmail}:z.object({id:z.uuid(),email:z.email()}).parse(await api('/api/v1/auth/me'));
 if(process.env.OPINTEL_CUSTOMER_JOB==='1'&&!(await withPlatform(tx=>tx.query('SELECT 1 FROM user_account WHERE id=$1 AND last_login_at IS NOT NULL',[actor.id]))).length)throw new OperatorConflict('Complete normal owner login before operating the demo');
 if(actor.id!==users[0]!.id||actor.email!==config.ownerEmail)throw new OperatorConflict('The normal login session must belong to the declared company administrator');
 const userId=UserId(actor.id),companyId=CompanyId(config.companyId);
 const auth=new SpiceDbAuthorizationPort({endpoint:required('SPICEDB_ENDPOINT'),token:required('SPICEDB_TOKEN'),clock:new SystemClock(),stalenessCeilingMs:0});
 const authorize=async(type:'company'|'project',id:string,permission='administer')=>{if(!(await auth.check({resource:{type,id},permission,subject:{type:'user',id:userId}})).allowed)throw new OperatorConflict('Operator authorization refused');};
 try{await authorize('company',companyId);}catch(e){auth.close();throw e;}
 return {config,userId,companyId,auth,authorize};
}
export const provisionManifest=z.strictObject({version:z.literal(1),projectId:z.uuid().transform(ProjectId),engineId:z.uuid(),configHash:z.string()});
export const operatorApiTarget=()=>process.env.OPINTEL_OPERATOR_API_TARGET??required('OPINTEL_API_BASE_URL');
export async function api(path:string,method='GET',body?:unknown){const base=new URL(operatorApiTarget());if(base.protocol!=='https:')throw new OperatorConflict('Packaged API target requires HTTPS');const cookie=(await privateRead(required('OPINTEL_OBSERVER_COOKIE'))).trim();if(!/^opintel_session=[^;\s]+$/u.test(cookie))throw new OperatorConflict('Normal login cookie required');const r=await fetch(new URL(path,base),{method,headers:{cookie,'content-type':'application/json',origin:base.origin},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok){await r.body?.cancel();throw new OperatorConflict('Packaged API request refused: HTTP '+r.status);}return r.json() as Promise<unknown>;}

export class OperatorConflict extends Error {}
export function operatorFailure(e:unknown){operatorDiagnostic(e);}
