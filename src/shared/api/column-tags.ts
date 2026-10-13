import {z} from 'zod';
import {createApiClient} from './client.js';
const name=z.string().trim().min(1).max(128).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/u);
export const ColumnTags=z.object({tags:z.record(name,name),suggestions:z.array(z.string())});
export const ColumnTagsBody=z.object({projectId:z.uuid(),tags:z.record(name,name).refine(v=>Object.keys(v).length<=32)});
export function readColumnTags(projectId:string,elementId:string,client=createApiClient()){return client.request({path:`/api/v1/elements/${elementId}/scope-tags?projectId=${projectId}`,response:ColumnTags});}
export function saveColumnTags(elementId:string,body:z.infer<typeof ColumnTagsBody>,client=createApiClient()){return client.request({method:'PUT',path:`/api/v1/elements/${elementId}/scope-tags`,body,response:ColumnTags});}

export function columnTagsOpenApiDocument(){return {openapi:'3.1.0',info:{title:'Catalogue scope tags',version:'1'},paths:{'/api/v1/elements/{id}/scope-tags':{get:{description:'Project set_entitlement permission; catalogue tags and matching Vocabulary suggestions.',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'Column tag bindings',content:{'application/json':{schema:z.toJSONSchema(ColumnTags)}}}}},put:{description:'Project set_entitlement permission. Store one tag per domain; no tag-rule execution.',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(ColumnTagsBody)}}},responses:{'200':{description:'Saved bindings',content:{'application/json':{schema:z.toJSONSchema(ColumnTags)}}}}}}}};}
