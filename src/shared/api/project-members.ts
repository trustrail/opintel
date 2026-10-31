import {z} from 'zod';
import {createApiClient} from './client.js';
export const ProjectGrantRemovalResponse=z.strictObject({removed:z.boolean(),companyAccessRemains:z.boolean()});
export function removeProjectGrant(project:string,user:string){return createApiClient().request({path:`/api/v1/projects/${project}/members/${user}`,method:'DELETE',response:ProjectGrantRemovalResponse});}
