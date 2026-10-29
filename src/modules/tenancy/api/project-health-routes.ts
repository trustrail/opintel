import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {ProjectId} from '../../../shared/kernel/index.js';
import {ProjectHealth} from '../../../shared/api/project-health.js';
import type {ProjectHealthReader} from '../application/project-health.js';
export function projectHealthRoutes(reader:ProjectHealthReader){return [defineRoute({
 method:'GET',path:'/api/v1/projects/:id/health',params:z.object({id:z.uuid()}),request:z.undefined(),response:ProjectHealth,
 permission:{resource:'project',id:r=>r.params.id,permission:'view'},
 handle:async r=>{const result=await reader.read({projectId:ProjectId(r.params.id),userId:r.actor.id});if(!result.ok)throw result.error;return {headers:{'cache-control':'no-store'},body:result.value};},
})];}
