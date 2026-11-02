import {z} from 'zod';
import {CertificateAssociation} from './certificate-association.js';
import {createApiClient} from './client.js';
export const CustodyIdentities=z.strictObject({items:z.array(CertificateAssociation)});
export const CustodyIdentityPage=CustodyIdentities.extend({nextCursor:z.string().nullable()});
export type CustodyIdentities=z.infer<typeof CustodyIdentities>;
export function listCustodyIdentities(project:string,cursor?:string){return createApiClient().request({path:`/api/v1/projects/${project}/custody-identities?${new URLSearchParams({limit:'100',...cursor?{cursor}:{}})}`,response:CustodyIdentityPage});}
export function custodyIdentitiesOpenApiDocument(){return {openapi:'3.1.0',info:{title:'Public custody identities',version:'1'},paths:{'/api/v1/projects/{id}/custody-identities':{get:{'x-permission':'project#administer',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},{name:'cursor',in:'query',schema:{type:'string'}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:50}}],responses:{200:{description:'Public XQ associations only. Never bundle paths, device tokens, private keys or transport keys.',content:{'application/json':{schema:z.toJSONSchema(CustodyIdentityPage)}}}}}}}};}
