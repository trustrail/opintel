import {projectSettingSchema} from '../../../shared/project-settings.js';
import {z} from 'zod';
import {ok,type ProjectId,type UserId,type RunId,type Result} from '../../../shared/kernel/index.js';
import type {AuthorizationPort} from '../../authz/index.js';
import {ActivityEntry,EvidenceDetail,type ActivityFilters} from '../../../shared/api/activity.js';
export type EvidenceContext={projectId:ProjectId;userId:UserId};
export type EvidencePosition={id:RunId;at:string};
export interface EvidenceReader {
 settings(ctx:EvidenceContext):Promise<unknown>;
 list(ctx:EvidenceContext,filters:ActivityFilters,after:EvidencePosition|null,limit:number):Promise<Result<ActivityEntry[]>>;
 detail(ctx:EvidenceContext,id:RunId,at:string):Promise<Result<EvidenceDetail>>;
}
export interface EvidenceTextPort {stripSql(sql:string):Promise<string|null>}
const policy=z.object({evidence:z.object({redaction:projectSettingSchema('evidence.redaction').pipe(z.enum(['aggressive','allowlist','none'])),allowlistedFields:projectSettingSchema('evidence.allowlistedFields').pipe(z.array(z.string()))}).default({redaction:'aggressive',allowlistedFields:[]})});
export class EvidenceQuery {
 constructor(private readonly reader:EvidenceReader,private readonly authorization:AuthorizationPort,private readonly text:EvidenceTextPort){}
 private async visibility(ctx:EvidenceContext){
  const [checks,settings]=await Promise.all([this.authorization.checkMany([{resource:{type:'project',id:ctx.projectId},subject:{type:'user',id:ctx.userId},permission:'view_unredacted'}]),this.reader.settings(ctx)]);
  const parsed=policy.safeParse(settings);return checks[0]?.allowed&&parsed.success?parsed.data.evidence:{redaction:'aggressive' as const,allowlistedFields:[]};
 }
 private async redact<T extends ActivityEntry>(row:T,settings:Awaited<ReturnType<EvidenceQuery['visibility']>>):Promise<T>{
  if(settings.redaction==='none')return {...row,argumentVisibility:'raw'};
  // Prompts have no parsed SQL structure in Slice 1a. Never fall back to raw prose.
  const request=settings.redaction==='allowlist'&&row.mode==='query'&&settings.allowlistedFields.includes('sql')&&row.request!==null?await this.text.stripSql(row.request):null;
  return {...row,request,argumentVisibility:request===null?'hidden':'literal_stripped'};
 }
 async list(ctx:EvidenceContext,filters:ActivityFilters,after:EvidencePosition|null,limit:number){
  const settings=await this.visibility(ctx),rows=await this.reader.list(ctx,filters,after,limit);if(!rows.ok)return rows;
  const items:ActivityEntry[]=[];for(const row of rows.value)items.push(await this.redact(row,settings));return ok(items);
 }
 async redactRecords(ctx:EvidenceContext,rows:EvidenceDetail[]):Promise<Result<EvidenceDetail[]>>{
  const settings=await this.visibility(ctx),result:EvidenceDetail[]=[];
  for(const row of rows){const redacted=await this.redact(row,settings);result.push({...redacted,generatedSql:settings.redaction==='none'?row.generatedSql:settings.redaction==='allowlist'&&settings.allowlistedFields.includes('sql')&&row.generatedSql?await this.text.stripSql(row.generatedSql):null});}
  return ok(result);
 }
 async detail(ctx:EvidenceContext,id:RunId,at:string){
  const row=await this.reader.detail(ctx,id,at);if(!row.ok)return row;
  const result=await this.redactRecords(ctx,[row.value]);return result.ok?ok(result.value[0]!):result;
 }
}
