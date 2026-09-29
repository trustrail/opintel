import {z} from 'zod';
import {createApiClient} from './client.js';
import {PoolKeyMetadata} from './pool-keys.js';
import {AgentPresenceView} from './agent-presence.js';
export const PoolSummary=z.object({id:z.uuid(),name:z.string(),sourceIds:z.array(z.uuid()),modeQuery:z.boolean(),modePrompt:z.boolean(),workingKeys:z.number().int().nonnegative(),agents:z.number().int().nonnegative(),activeAgents:z.number().int().nonnegative(),clearElements:z.number().int().nonnegative(),activeElements:z.number().int().nonnegative()});
export type PoolSummary=z.infer<typeof PoolSummary>;
export const PoolPage=z.object({items:z.array(PoolSummary),nextCursor:z.string().nullable()});
export const PoolDetail=PoolSummary.extend({keys:z.array(PoolKeyMetadata),graceSeconds:z.number().int().positive()});
export type PoolDetail=z.infer<typeof PoolDetail>;
export const AgentTwin=z.object({presence:AgentPresenceView,keyMetadata:PoolKeyMetadata});
export type AgentTwin=z.infer<typeof AgentTwin>;
export function readPool(project:string,pool:string){return createApiClient().request({path:`/api/v1/pools/${pool}?projectId=${project}`,response:PoolDetail});}
export function readTwin(project:string,pool:string,agent:string){return createApiClient().request({path:`/api/v1/pools/${pool}/agents/${encodeURIComponent(agent)}?projectId=${project}`,response:AgentTwin});}
export function poolsReadOpenApiDocument(){
 const routes: Array<{path:string;schema:z.ZodType;list?:boolean;twin?:boolean}>=[{path:'/api/v1/projects/{id}/pools',schema:PoolPage,list:true},{path:'/api/v1/pools/{id}',schema:PoolDetail},{path:'/api/v1/pools/{id}/agents/{agentId}',schema:AgentTwin,twin:true}];
 return {openapi:'3.1.0',info:{title:'Pools inspection',version:'1'},paths:Object.fromEntries(routes.map(r=>[r.path,{get:{'x-permission':'project#view',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},...(r.list?[{name:'cursor',in:'query',required:false,schema:{type:'string'}},{name:'limit',in:'query',required:false,schema:{type:'integer',minimum:1}}]:[{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}}]),...(r.twin?[{name:'agentId',in:'path',required:true,schema:{type:'string'}}]:[])],responses:{200:{description:'Pool inspection; key metadata only, never a credential',content:{'application/json':{schema:z.toJSONSchema(r.schema)}}},default:{description:'Standard error envelope'}}}}]))};
}
