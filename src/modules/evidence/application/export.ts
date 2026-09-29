import {z} from 'zod';
import {DomainError,err,ok,RunId,type Result} from '../../../shared/kernel/index.js';
import {EvidenceExportRecord,type ExportCommand,type EvidenceExportDescriptor} from '../../../shared/api/evidence-export.js';
import type {EvidenceDetail} from '../../../shared/api/activity.js';
import type {AuthorizationPort} from '../../authz/index.js';
import type {EvidenceContext,EvidencePosition,EvidenceQuery} from './read.js';
export const ExportId=z.uuid().brand<'ExportId'>();
export type ExportId=z.infer<typeof ExportId>;
export interface ExportRepository {
 create(ctx:EvidenceContext,command:ExportCommand,key:string):Promise<Result<EvidenceExportDescriptor>>;
 find(ctx:EvidenceContext,id:ExportId):Promise<Result<EvidenceExportDescriptor>>;
 link(ctx:EvidenceContext,id:ExportId):Promise<Result<{signature:string;expires:number}>>;
 verify(ctx:EvidenceContext,id:ExportId,signature:string,expires:number):Promise<Result<void>>;
 page(ctx:EvidenceContext,descriptor:EvidenceExportDescriptor,after:EvidencePosition|null,limit:number):Promise<Result<EvidenceDetail[]>>;
}
export class EvidenceExportService {
 constructor(private readonly repository:ExportRepository,private readonly query:EvidenceQuery,private readonly authorization:AuthorizationPort){}
 async create(ctx:EvidenceContext,command:ExportCommand,key:unknown){
  const parsed=z.string().min(1).max(200).safeParse(key);if(!parsed.success)return err(new DomainError('validation_failed','Idempotency-Key is required for evidence export.'));
  return this.repository.create(ctx,command,parsed.data);
 }
 async status(ctx:EvidenceContext,id:ExportId){
  const descriptor=await this.repository.find(ctx,id);if(!descriptor.ok)return descriptor;
  const signed=await this.repository.link(ctx,id);if(!signed.ok)return signed;
  return ok({...descriptor.value,status:'ready' as const,expiresAt:new Date(signed.value.expires).toISOString(),downloadUrl:`/api/v1/exports/${id}/download?${new URLSearchParams({projectId:ctx.projectId,expires:String(signed.value.expires),signature:signed.value.signature})}`});
 }
 async download(ctx:EvidenceContext,id:ExportId,signature:string,expires:number){
  const checked=await this.repository.verify(ctx,id,signature,expires);if(!checked.ok)return checked;
  return this.repository.find(ctx,id);
 }
 async *records(ctx:EvidenceContext,descriptor:EvidenceExportDescriptor,signal:AbortSignal):AsyncGenerator<Result<EvidenceExportRecord>>{
  let after:EvidencePosition|null=null;
  while(!signal.aborted){
   const permission=await this.authorization.check({resource:{type:'project',id:ctx.projectId},subject:{type:'user',id:ctx.userId},permission:'export_evidence'});
   if(!permission.allowed){yield err(new DomainError('forbidden','You no longer have permission to export evidence.'));return;}
   const fetched=await this.repository.page(ctx,descriptor,after,100);if(!fetched.ok){yield fetched;return;}const page=fetched.value;if(!page.length||signal.aborted)return;
   const redacted=await this.query.redactRecords(ctx,page);if(!redacted.ok){yield redacted;return;}
   for(const row of redacted.value){
    if(signal.aborted)return;
    if(row.synthetic===true)continue;
    yield ok(EvidenceExportRecord.parse({...row,demoProvenance:row.status==='incomplete'?'unknown':'none',elements:row.elements.filter(e=>e.elementId!==null||e.state==='withheld'||e.state==='undecided'),objects:row.objects.map(o=>({...o,columns:o.columns.filter(c=>c.elementId!==null)}))}));
   }
   const last=page.at(-1)!;after={id:RunId(last.id),at:last.startedAt};if(page.length<100)return;
  }
 }
}
// Fixed columns, one run per row. Quote every cell; double embedded quotes.
export const exportColumns=Object.keys(EvidenceExportRecord.shape) as (keyof EvidenceExportRecord)[];
const csvCell=(value:unknown)=>{
 const text=value===null?'':typeof value==='object'?JSON.stringify(value):String(value);
 // Quoting alone does not prevent a spreadsheet from executing text as a formula.
 const safe=typeof value==='string'&&(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))?"'"+text:text;
 return '"'+safe.replaceAll('"','""')+'"';
};
export const csvHeader=()=>exportColumns.map(csvCell).join(',')+'\r\n';
export const encodeEvidence=(row:EvidenceExportRecord,format:'ndjson'|'csv')=>format==='ndjson'?JSON.stringify(row)+'\n':exportColumns.map(key=>csvCell(row[key])).join(',')+'\r\n';
