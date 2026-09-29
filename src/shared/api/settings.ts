import {z} from 'zod';
import {ProjectSettings} from '../project-settings.js';
import {RegionSchema} from './tenancy-schemas.js';
export {ProjectSettings};
export const ProjectSettingsView=z.object({settings:z.record(z.string(),z.unknown())});
export const CompanySettings=z.strictObject({name:z.string().trim().min(1).max(120),defaultIndustryId:z.uuid().nullable(),defaultRegion:RegionSchema,allowedDomains:z.array(z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u)),idleTimeoutMins:z.number().int().min(1).max(43200),ssoEnforced:z.boolean()});
export const CompanySettingsView=CompanySettings.extend({id:z.uuid(),enabledProviders:z.array(z.object({id:z.uuid(),displayName:z.string()}))});
export const PersonalSettings=z.strictObject({fullName:z.string().trim().min(1).nullable(),timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'Choose an IANA timezone.'),dateFormat:z.enum(['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY']),reducedMotion:z.boolean()});
export const PersonalSettingsView=PersonalSettings.extend({email:z.email()});
