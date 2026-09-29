import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {ProjectId,CompanyId} from '../../../shared/kernel/index.js';
import {ProjectSettings,ProjectSettingsView,CompanySettings,CompanySettingsView,PersonalSettings,PersonalSettingsView} from '../../../shared/api/settings.js';
import type {SettingsRepository} from '../application/settings.js';
export function settingsRoutes(service:SettingsRepository){return [
 defineRoute({method:'GET',path:'/api/v1/projects/:id/settings',params:z.object({id:z.uuid()}),request:z.undefined(),response:ProjectSettingsView,permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{const v=await service.project(ProjectId(r.params.id));if(!v.ok)throw v.error;return {body:v.value,headers:{'cache-control':'no-store'}};}}),
 defineRoute({method:'PATCH',path:'/api/v1/projects/:id/settings',params:z.object({id:z.uuid()}),request:ProjectSettings,response:ProjectSettingsView,permission:{resource:'project',id:r=>r.params.id,permission:'administer'},handle:async r=>{const v=await service.saveProject(ProjectId(r.params.id),r.actor.id,r.body);if(!v.ok)throw v.error;return {body:v.value};}}),
 defineRoute({method:'GET',path:'/api/v1/companies/:id/settings',params:z.object({id:z.uuid()}),request:z.undefined(),response:CompanySettingsView,permission:{resource:'company',id:r=>r.params.id,permission:'view'},handle:async r=>{const v=await service.company(CompanyId(r.params.id));if(!v.ok)throw v.error;return {body:v.value,headers:{'cache-control':'no-store'}};}}),
 defineRoute({method:'PATCH',path:'/api/v1/companies/:id/settings',params:z.object({id:z.uuid()}),request:CompanySettings,response:CompanySettingsView,permission:{resource:'company',id:r=>r.params.id,permission:'administer'},handle:async r=>{const v=await service.saveCompany(CompanyId(r.params.id),r.actor.id,r.body);if(!v.ok)throw v.error;return {body:v.value};}}),
 defineRoute({method:'GET',path:'/api/v1/me/settings',params:z.object({}),request:z.undefined(),response:PersonalSettingsView,permission:'authenticated',handle:async r=>{const v=await service.personal(r.actor.id);if(!v.ok)throw v.error;return {body:v.value,headers:{'cache-control':'no-store'}};}}),
 defineRoute({method:'PATCH',path:'/api/v1/me/settings',params:z.object({}),request:PersonalSettings,response:PersonalSettingsView,permission:'authenticated',handle:async r=>{const v=await service.savePersonal(r.actor.id,r.body);if(!v.ok)throw v.error;return {body:v.value};}}),
];}
