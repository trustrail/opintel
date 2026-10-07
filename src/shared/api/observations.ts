import {z} from 'zod';
import {quarantineCategorySchema} from '../landing-contract.js';
const state=z.enum(['open','resolved']);
export const ObservationCause=z.enum([...quarantineCategorySchema.options,'unmapped','custody_failed','custody_mismatch']);
export const ObservationFact=z.object({at:z.iso.datetime({offset:true}),state,resolution:z.string().nullable(),cause:ObservationCause});
export const ObservationMember=z.object({id:z.string(),kind:z.enum(['filing','type','custody']),state,observedAt:z.iso.datetime({offset:true}),resolvedAt:z.iso.datetime({offset:true}).nullable(),resolution:z.string().nullable(),
 metadata:z.object({filingId:z.uuid().optional(),zoneId:z.uuid().optional(),sourceId:z.uuid().optional(),sourceName:z.string().optional(),engineId:z.uuid().nullable().optional(),engineName:z.string().nullable().optional(),elementId:z.uuid().optional(),object:z.string().nullable().optional(),column:z.string().nullable().optional(),sourceType:z.string().optional(),runId:z.uuid().optional(),resolutionRunId:z.uuid().optional(),keyVersion:z.number().int().positive().optional(),keyState:z.enum(['current','retired']).nullable().optional()}),history:z.array(ObservationFact)}).superRefine((member,ctx)=>{
 const required=member.kind==='filing'?['filingId','zoneId']:member.kind==='type'?['elementId','sourceId','runId']:['keyVersion'];
 for(const field of required)if(member.metadata[field as keyof typeof member.metadata]===undefined)ctx.addIssue({code:'custom',path:['metadata',field],message:'Required observation identifier is missing.'});
});
export const ObservationGroup=z.object({id:z.string(),kind:z.enum(['filing','type','custody']),cause:ObservationCause,causeDetail:z.string(),state,count:z.number().int().positive(),oldestAt:z.iso.datetime({offset:true}),latestAt:z.iso.datetime({offset:true})});
export const ObservationPage=z.object({items:z.array(ObservationGroup),nextCursor:z.string().nullable(),counts:z.object({open:z.number().int().nonnegative(),resolved:z.number().int().nonnegative()})});
export const ObservationMemberPage=z.object({items:z.array(ObservationMember),nextCursor:z.string().nullable()});
export const ObservationQuery=z.object({view:state.default('open'),cursor:z.string().max(4096).optional(),limit:z.coerce.number().int().min(1).max(100).default(25)});
export const ObservationMemberQuery=z.object({group:z.string().min(1).max(2048),view:state.default('open'),cursor:z.string().max(4096).optional(),limit:z.coerce.number().int().min(1).max(100).default(25)});
export type ObservationGroup=z.infer<typeof ObservationGroup>;
export type ObservationMember=z.infer<typeof ObservationMember>;

export function observationOpenApiDocument(){
 const response=(schema:z.ZodType)=>({description:'Success',content:{'application/json':{schema:z.toJSONSchema(schema)}}});
 const paths:Record<string,unknown>={};
 const failure={description:'Standard error envelope',content:{'application/json':{schema:z.toJSONSchema(z.object({error:z.object({code:z.string(),message:z.string(),requestId:z.string(),retryable:z.boolean(),details:z.record(z.string(),z.unknown()).optional()})}))}}};
 for(const custody of [false,true])for(const members of [false,true]){
  const query=members?ObservationMemberQuery:ObservationQuery;
  paths[`/api/v1/projects/{id}/${custody?'custody-observations':'observations'}${members?'/members':''}`]={get:{description:`Requires project#${custody?'administer':'view'}. Read-only safe finding history; cursors bind project, state, custody permission and group.`,parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},...Object.entries(query.shape).map(([name,schema])=>({name,in:'query',required:name==='group',schema:z.toJSONSchema(schema)}))],responses:{'200':response(members?ObservationMemberPage:ObservationPage),default:failure}}};
 }
 return {openapi:'3.1.0',info:{title:'Opintel observations',version:'1'},components:{securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'opintel_session'}}},security:[{sessionCookie:[]}],paths};
}
