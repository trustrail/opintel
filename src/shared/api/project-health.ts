import {z} from 'zod';
import {createApiClient} from './client.js';
export const ProjectHealthItem=z.strictObject({
 kind:z.enum(['engine','sources','custody','tls','token_key']),
 status:z.enum(['ok','warning','down','unknown']),
 checked_at:z.iso.datetime({offset:true}).nullable(),reason:z.string(),
 next_action:z.strictObject({label:z.string(),href:z.string().startsWith('/projects/')}).nullable(),
});
export const ProjectHealth=z.strictObject({items:z.array(ProjectHealthItem)});
export type ProjectHealthItem=z.infer<typeof ProjectHealthItem>;
export type ProjectHealth=z.infer<typeof ProjectHealth>;
export function readProjectHealth(project:string,client=createApiClient()){
 return client.request({path:`/api/v1/projects/${project}/health`,response:ProjectHealth});
}
export function projectHealthOpenApiDocument(){return {openapi:'3.1.0',info:{title:'Project health',version:'1'},paths:{'/api/v1/projects/{id}/health':{get:{'x-permission':'project#view',description:'Saved checks and TLS deployment configuration; no mail status or certificate expiry claim.',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{200:{description:'One shape per health kind. Unknown never implies healthy.',content:{'application/json':{schema:z.toJSONSchema(ProjectHealth)}}},default:{description:'Standard error envelope'}}}}}};}
