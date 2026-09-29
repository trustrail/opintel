import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createHttpServer} from '../../../src/platform/http/index.js';
import {evidenceExportRoutes} from '../../../src/modules/evidence/api/export-routes.js';
import {EvidenceQuery,PostgresEvidenceReader,DuckDBEvidenceText,EvidenceExportService,PostgresEvidenceExports} from '../../../src/modules/evidence/index.js';
import {Timestamp,UserId} from '../../../src/shared/kernel/index.js';
import {withTenant,withPlatform} from '../../../src/platform/db/scope.js';
import type {AuthorizationPort,AuthorizationRevision} from '../../../src/modules/authz/index.js';
import {policyFixture} from '../policy-version/fixture.js';
import {EvidenceExportDescriptor,EvidenceExportStatus,type ExportCommand} from '../../../src/shared/api/evidence-export.js';
export async function exportFixture(){
 const f=await policyFixture(1),permissions={view:true,export:true,unredacted:true,user:f.ctx.userId};
 const verdict=(allowed:boolean)=>({allowed,token:'export-test' as AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0});
 const unexpected=async():Promise<never>=>{throw new Error('Unexpected auth mutation');};
 const auth:AuthorizationPort={check:async r=>verdict(r.permission==='view'?permissions.view:permissions.export),checkMany:async rs=>rs.map(()=>verdict(permissions.unredacted)),write:unexpected,explain:unexpected};
 const repository=new PostgresEvidenceExports(),query=new EvidenceQuery(new PostgresEvidenceReader(),auth,new DuckDBEvidenceText()),service=new EvidenceExportService(repository,query,auth);
 const server=createHttpServer(evidenceExportRoutes(service),{logger:{error:()=>{}},authorization:{port:auth,currentUser:async()=>({id:permissions.user,email:'export@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No address');const base=`http://127.0.0.1:${address.port}`;
 const post=(command:ExportCommand,key=randomUUID())=>fetch(`${base}/api/v1/projects/${f.ctx.projectId}/exports`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(command)});
 const status=(id:string)=>fetch(`${base}/api/v1/exports/${id}?projectId=${f.ctx.projectId}`);
 return {...f,repository,service,permissions,base,post,status,
  otherActor:()=>{permissions.user=UserId(randomUUID());},
  close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}),
  settings:(redaction:string,fields:string[]=[])=>withPlatform(tx=>tx.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{evidence:{redaction,allowlistedFields:fields}}])),
  link:async(command:ExportCommand)=>{const d=EvidenceExportDescriptor.parse(await (await post(command)).json());return EvidenceExportStatus.parse(await (await status(d.id)).json());},
  run:async(synthetic:boolean|null=false,request="SELECT field_1 FROM warehouse.public.records WHERE field_1='private-value'",mode='query',agent='export-agent')=>{
   const id=randomUUID(),at=new Date().toISOString();await withTenant(f.ctx,async tx=>{
    await tx.query('INSERT INTO query_run(id,project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,$4,\'opk_export\',$5,$6,$7,$8)',[id,f.ctx.projectId,f.pool,agent,mode,request,{policy:19,catalog:11,vocabulary:3,tokenKeyVersionSelected:null},at]);
    if(synthetic!==null){
     for(const [elementId,name,state,treatment] of [[f.ids[0],'field_1','released','clear'],[null,'derived_output','released','clear'],[null,'unknown_field','undecided',null]] as const)await tx.query('INSERT INTO run_element(run_id,started_at,element_id,exposed_name,state,treatment) VALUES($1,$2,$3,$4,$5,$6)',[id,at,elementId,name,state,treatment]);
     await tx.query('INSERT INTO run_completion(run_id,started_at,outcome,synthetic,completed_at,source_plan) VALUES($1,$2,$3,$4,$2,$5)',[id,at,{kind:'answered',rowCount:1,truncated:false},synthetic,{sources:[{origin:'demo'}]}]);
    }
   });return {id,at};
  },
 };
}
export type ExportFixture=Awaited<ReturnType<typeof exportFixture>>;
