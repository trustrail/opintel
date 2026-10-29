import {z} from 'zod';
import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import {custodyAvailability} from '../../release-custody/index.js';
import {projectHealth,type ProjectHealthReader,type HealthFacts} from '../application/project-health.js';
/** Read the existing public deployment flag, never infer a certificate's validity. */
export async function deploymentTls():Promise<HealthFacts['tls']>{
 const base=process.env.APP_BASE_URL;if(!base)return null;
 try{
  const response=await fetch(new URL('/deployment.json',base),{signal:AbortSignal.timeout(1500),redirect:'error'});
  if(!response.ok)return null;
  const flag=z.strictObject({selfSignedTls:z.boolean()}).safeParse(await response.json());
  return flag.success?{...flag.data,at:new Date().toISOString()}:null;
 }catch{return null;}
}
export class PostgresProjectHealthReader implements ProjectHealthReader {
 constructor(private readonly tls:()=>Promise<HealthFacts['tls']>=deploymentTls){}
 async read(ctx:Parameters<ProjectHealthReader['read']>[0]){
  const [project]=await withPlatform(tx=>tx.query<{custody_check:unknown}>('SELECT custody_check FROM project WHERE id=$1',[ctx.projectId]));
  if(!project)return err(new DomainError('not_found','The project was not found.'));
  const facts=await withTenant(ctx,async tx=>{
   const engines=await tx.query<HealthFacts['engines'][number]>(`SELECT health,to_char(last_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM engine`);
   const sources=await tx.query<HealthFacts['sources'][number]>(`SELECT CASE WHEN s.status IN ('unreachable','introspection_failed','failed','unavailable') THEN s.status WHEN r.state IN ('failed','cancelled') THEN 'introspection_failed' WHEN r.state IN ('queued','connecting','reading','diffing') THEN 'pending' ELSE s.status END AS status,to_char(COALESCE(r.ended_at,s.last_introspected_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM data_source s LEFT JOIN LATERAL(SELECT state,ended_at FROM introspection_run r WHERE r.source_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true WHERE s.status<>'archived'`);
   const [tokenKey]=await tx.query<NonNullable<HealthFacts['tokenKey']>>(`SELECT to_char(backup_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "backupAt",to_char(last_rehearsed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "rehearsedAt",last_rehearsal AS rehearsal FROM token_key_version WHERE state='current'`);
   return {engines,sources,tokenKey:tokenKey??null};
  });
  const custody=await custodyAvailability(ctx.projectId),tls=await this.tls();
  const dashboard=z.object({dashboard:z.object({status:z.enum(['authenticated','failed','not_set'])}).optional()}).safeParse(project.custody_check);
  return ok(projectHealth(ctx.projectId,{...facts,custody:{...custody,isXq:custody.configuration?.provider==='xq',dashboard:dashboard.success?dashboard.data.dashboard?.status??null:null},tls}));
 }
}
