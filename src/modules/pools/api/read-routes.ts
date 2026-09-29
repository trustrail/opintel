import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {PoolId,ProjectId} from '../../../shared/kernel/index.js';
import {PoolDetail,AgentTwin} from '../../../shared/api/pools.js';
import type {PoolReader} from '../application/read.js';
export function poolReadRoutes(reader:PoolReader){return [
 defineRoute({method:'GET',path:'/api/v1/pools/:id',params:z.object({id:z.uuid()}),query:z.object({projectId:z.uuid()}),request:z.undefined(),response:PoolDetail,permission:{resource:'project',id:r=>r.query.projectId,permission:'view'},handle:async r=>{const result=await reader.detail({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id));if(!result.ok)throw result.error;return {body:result.value,headers:{'cache-control':'no-store'}};}}),
 defineRoute({method:'GET',path:'/api/v1/pools/:id/agents/:agentId',params:z.object({id:z.uuid(),agentId:z.string().min(1)}),query:z.object({projectId:z.uuid()}),request:z.undefined(),response:AgentTwin,permission:{resource:'project',id:r=>r.query.projectId,permission:'view'},handle:async r=>{const result=await reader.twin({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id),r.params.agentId);if(!result.ok)throw result.error;return {body:result.value,headers:{'cache-control':'no-store'}};}}),
 ];}
