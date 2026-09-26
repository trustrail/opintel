import { z } from 'zod';
import { defineRoute,cursorPagination } from '../../../platform/http/index.js';
import { AgentPresencePage,AgentPresenceQuerySchema } from '../../../shared/api/agent-presence.js';
import { DomainError,PoolId,ProjectId } from '../../../shared/kernel/index.js';
import type { AgentPresenceService } from '../application/presence.js';
export function agentPresenceRoutes(service:AgentPresenceService){return [defineRoute({
 method:'GET',path:'/api/v1/pools/:id/agents',params:z.object({id:z.uuid()}),query:AgentPresenceQuerySchema,request:z.undefined(),response:AgentPresencePage,
 permission:{resource:'project',id:r=>r.query.projectId,permission:'view'},handle:async r=>{
  const scope=JSON.stringify([r.query.projectId,r.params.id]),page=cursorPagination(undefined,r.query.limit);let after:string|null=null;
  if(r.query.cursor){try{const cursor=z.strictObject({scope:z.string(),after:z.string()}).parse(JSON.parse(Buffer.from(r.query.cursor,'base64url').toString('utf8')));if(cursor.scope!==scope)throw new Error();after=cursor.after;}catch{throw new DomainError('validation_failed','The presence cursor is invalid or belongs to another pool.');}}
  const result=await service.list({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id),after,page.limit+1);if(!result.ok)throw result.error;
  const items=result.value.slice(0,page.limit).map(({projectId:_project,...row})=>row);
  return {body:{items,nextCursor:result.value.length>page.limit?Buffer.from(JSON.stringify({scope,after:items.at(-1)!.agentId})).toString('base64url'):null},headers:{'cache-control':'no-store',...(page.warning?{Warning:page.warning}:{})}};
 },
})];}
