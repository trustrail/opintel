import {z} from 'zod';
import {defineRoute} from '../../../platform/http/index.js';
import {ProjectId,DomainError} from '../../../shared/kernel/index.js';
import {NeedsYouQuery,NeedsYouPage} from '../../../shared/api/needs-you.js';
import type {AuthorizationPort} from '../../authz/index.js';
import type {NeedsYouReader} from '../application/needs-you.js';
const cursor=z.strictObject({project:z.uuid(),admin:z.boolean(),after:z.string()});
export function needsYouRoutes(reader:NeedsYouReader,authorization:AuthorizationPort){return [defineRoute({method:'GET',path:'/api/v1/projects/:id/needs-you',params:z.object({id:z.uuid()}),query:NeedsYouQuery,request:z.undefined(),response:NeedsYouPage,permission:{resource:'project',id:r=>r.params.id,permission:'view'},handle:async r=>{
 const [permission]=await authorization.checkMany([{resource:{type:'project',id:r.params.id},permission:'administer',subject:{type:'user',id:r.actor.id}}]),admin=permission?.allowed===true;
 let after:string|null=null;
 if(r.query.cursor){try{const value=cursor.parse(JSON.parse(Buffer.from(r.query.cursor,'base64url').toString('utf8')));if(value.project!==r.params.id||value.admin!==admin)throw new Error();after=value.after;}catch{throw new DomainError('validation_failed','This needs-you cursor is invalid or belongs to another project or permission scope.');}}
 const result=await reader.read({projectId:ProjectId(r.params.id),userId:r.actor.id},admin,after,r.query.limit+1);if(!result.ok)throw result.error;
 const items=result.value.slice(0,r.query.limit);return {headers:{'cache-control':'no-store'},body:{items,nextCursor:result.value.length>r.query.limit?Buffer.from(JSON.stringify({project:r.params.id,admin,after:items.at(-1)!.id})).toString('base64url'):null}};
}})];}
