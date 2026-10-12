import {z} from 'zod';
import {defineRoute,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {RowDecision,RowDecisionRead,RowDecisionBody,RowDecisionQuery,RowHistoryQuery,RowDecisionHistory} from '../../../shared/api/row-entitlements.js';
import {PoolId,ProjectId,ObjectId} from '../../../shared/kernel/index.js';
import type {RowDecisionRepository} from '../application/row-decisions.js';
const params=z.object({id:z.uuid(),objectId:z.uuid()});
export function rowDecisionRoutes(repo:RowDecisionRepository){return [
 defineRoute({method:'GET',path:'/api/v1/pools/:id/row-entitlements/:objectId/history',params,query:RowHistoryQuery,request:z.undefined(),response:z.union([RowDecisionHistory,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.query.projectId,permission:'set_entitlement'},handle:async r=>{const value=await repo.history({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id),ObjectId(r.params.objectId),r.query.cursor);if(!value.ok)throw value.error;return {body:value.value};}}),
 defineRoute({method:'GET',path:'/api/v1/pools/:id/row-entitlements/:objectId',params,query:RowDecisionQuery,request:z.undefined(),response:z.union([RowDecisionRead,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.query.projectId,permission:'set_entitlement'},handle:async r=>{const value=await repo.read({projectId:ProjectId(r.query.projectId),userId:r.actor.id},PoolId(r.params.id),ObjectId(r.params.objectId));if(!value.ok)throw value.error;return {body:value.value};}}),
 defineRoute({method:'PUT',path:'/api/v1/pools/:id/row-entitlements/:objectId',params,query:z.object({}),request:RowDecisionBody,response:z.union([RowDecision,errorEnvelopeSchema]),permission:{resource:'project',id:r=>r.body.projectId,permission:'set_entitlement'},handle:async r=>{const value=await repo.save({projectId:ProjectId(r.body.projectId),userId:r.actor.id},PoolId(r.params.id),ObjectId(r.params.objectId),r.body.expression);if(!value.ok)throw value.error;return {body:value.value};}})
];}
