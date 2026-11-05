import {z} from 'zod';
import {createApiClient} from './client.js';
export const ProvenanceKind=z.enum(['request','policy','sources','execution','custody','evidence']);
export const ProvenanceFact=z.strictObject({key:z.string(),label:z.string(),recorded:z.boolean(),value:z.string().nullable(),link:z.string().startsWith('/').optional(),copyable:z.boolean().default(false)}).refine(f=>f.recorded===(f.value!==null),'A recorded fact must have a stored value.');
export const ProvenanceStep=z.strictObject({kind:ProvenanceKind,title:z.string(),recorded:z.boolean(),facts:z.array(ProvenanceFact)});
export const Provenance=z.strictObject({receiptId:z.uuid(),projectId:z.uuid(),startedAt:z.iso.datetime({offset:true}),steps:z.tuple([ProvenanceStep.extend({kind:z.literal('request')}),ProvenanceStep.extend({kind:z.literal('policy')}),ProvenanceStep.extend({kind:z.literal('sources')}),ProvenanceStep.extend({kind:z.literal('execution')}),ProvenanceStep.extend({kind:z.literal('custody')}),ProvenanceStep.extend({kind:z.literal('evidence')})])});
export type Provenance=z.infer<typeof Provenance>;
export type ProvenanceFact=z.infer<typeof ProvenanceFact>;
export function provenanceDetail(project:string,id:string,client=createApiClient()){return client.request({path:`/api/v1/projects/${project}/provenance/${id}`,response:Provenance});}
export function provenanceOpenApiDocument(){return {openapi:'3.1.0',info:{title:'Stored provenance',version:'1'},paths:{'/api/v1/projects/{id}/provenance/{receiptId}':{get:{'x-permission':'project#view',description:'Accepts a retained receipt ID or a release grant ID. Only stored facts; missing historical fields have recorded=false. A step is recorded when at least one of its facts is recorded.',parameters:['id','receiptId'].map(name=>({name,in:'path',required:true,schema:{type:'string',format:'uuid'}})),responses:{200:{description:'Six ordered provenance steps',content:{'application/json':{schema:z.toJSONSchema(Provenance)}}}}}}}};}
