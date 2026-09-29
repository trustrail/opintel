import {withPlatform,withPlatformAdmin} from '../../../platform/db/scope.js';
import {ProjectId,ok,err,DomainError,type Result} from '../../../shared/kernel/index.js';
import {evidencePolicy,storedArgument} from '../application/lifecycle.js';
import type {EvidenceTextPort} from '../application/read.js';
import {DuckDBEvidenceText} from './text.js';
const actor={actor:{kind:'system' as const,name:'evidence-lifecycle'}};
export class EvidenceMaintenance {
 constructor(private readonly text:EvidenceTextPort=new DuckDBEvidenceText()){}
 async provision():Promise<void>{await withPlatformAdmin(actor,tx=>tx.query('SELECT provision_evidence_partitions()'));}
 async project(projectId:ProjectId):Promise<Result<void>>{
  const [project]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[projectId]));
  if(!project)return err(new DomainError('not_found','The evidence project was not found.'));
  const policy=evidencePolicy(project.settings);
  if(policy.redaction!=='none'){
   let at:string|null=null,id:string|null=null;
   for(;;){
    const rows=await withPlatformAdmin(actor,tx=>tx.query<{id:string;started_at:string;mode:'query'|'prompt';request:string|null;generated_sql:string|null}>('SELECT * FROM evidence_redaction_batch($1,$2,$3,100)',[projectId,at,id]));
    if(!rows.length)break;
    for(const row of rows){
     const request=await storedArgument(row.request,row.mode==='query'?'sql':'prompt',policy,this.text),sql=await storedArgument(row.generated_sql,'sql',policy,this.text);
     if(request!==row.request||sql!==row.generated_sql)await withPlatformAdmin(actor,tx=>tx.query('SELECT redact_evidence_arguments($1,$2,$3,$4,$5,$6,$7,$8)',[projectId,row.id,row.started_at,row.request,row.generated_sql,request,sql,policy]));
    }
    const last=rows.at(-1)!;at=last.started_at;id=last.id;if(rows.length<100)break;
   }
  }
  for(;;){const [row]=await withPlatformAdmin(actor,tx=>tx.query<{count:number}>('SELECT retain_evidence($1) AS count',[projectId]));if((row?.count??0)===0)break;}
  return ok(undefined);
 }
 async run():Promise<void>{
  await this.provision();
  const projects=await withPlatform(tx=>tx.query<{id:string}>('SELECT id FROM project ORDER BY id'));
  for(const project of projects){const result=await this.project(ProjectId(project.id));if(!result.ok)throw result.error;}
 }
}
