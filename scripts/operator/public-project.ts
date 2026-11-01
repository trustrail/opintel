import {ProjectListResponse} from '../../src/shared/api/tenancy-schemas.js';
import type {PublicApi} from '../soak/public-setup.js';
/** Project reads use the console's cursor-paginated list, not an invented route. */
export async function publicProject(call:PublicApi,id:string){let cursor:string|null=null;do{const page=ProjectListResponse.parse(await call('/api/v1/projects?'+new URLSearchParams({limit:'100',...(cursor?{cursor}:{})})));const project=page.items.find(p=>p.id===id);if(project)return project;cursor=page.nextCursor;}while(cursor);throw new Error('Recorded verifier project is missing or inaccessible');}
