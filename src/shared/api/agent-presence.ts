import { z } from 'zod';
import { createApiClient } from './client.js';
export const AgentIdHeader = z.string().min(1).refine(value=>value.trim().length>0,'X-Opintel-Agent-Id is required.');
export const PresenceSettings = z.object({agentHeartbeatSeconds:z.number().int().min(5).max(60).default(20),agentDisconnectGraceSeconds:z.number().int().min(60).max(3600).default(300)});
export const AgentPresenceState = z.enum(['connecting','active','idle','stale','disconnected']);
export const PresenceSignal = z.strictObject({agentId:AgentIdHeader,client:z.string().nullable().default(null),kind:z.enum(['connect','request','heartbeat'])});
export const AgentPresenceView = z.strictObject({poolId:z.uuid(),agentId:z.string(),client:z.string().nullable(),verified:z.literal(false),keyVersion:z.uuid(),firstSeen:z.iso.datetime(),lastSeen:z.iso.datetime(),lastRequestAt:z.iso.datetime().nullable(),lastHeartbeatAt:z.iso.datetime(),staleAt:z.iso.datetime().nullable(),reconnects:z.number().int().nonnegative(),state:AgentPresenceState});
export type AgentPresenceView = z.infer<typeof AgentPresenceView>;
export const AgentPresenceQuerySchema = z.object({projectId:z.uuid(),cursor:z.string().optional(),limit:z.coerce.number().int().positive().default(50)});
export const AgentPresencePage = z.object({items:z.array(AgentPresenceView),nextCursor:z.string().nullable()});
export function listPoolAgents(poolId:string,projectId:string,cursor?:string,client=createApiClient()){
 const query=new URLSearchParams({projectId,...(cursor===undefined?{}:{cursor})});
 return client.request({path:`/api/v1/pools/${poolId}/agents?${query}`,method:'GET',response:AgentPresencePage});
}
export function agentPresenceOpenApiDocument(){return {openapi:'3.1.0',info:{title:'Agent presence',version:'1'},paths:{'/api/v1/pools/{id}/agents':{get:{'x-permission':'project#view',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'projectId',in:'query',required:true,schema:{type:'string',format:'uuid'}},{name:'cursor',in:'query',schema:{type:'string'}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,default:50}}],responses:{200:{description:'All presence states, including disconnected agents. Cursor pagination.',content:{'application/json':{schema:z.toJSONSchema(AgentPresencePage)}}}}}}}};}
