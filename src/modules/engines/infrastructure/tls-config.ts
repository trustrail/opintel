import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {transportFailureCode} from '../../../shared/infrastructure/transport-failure-code.js';
import type {ApplicationTls} from '../application/registry.js';
const schema=z.strictObject({caFile:z.string().min(1),certFile:z.string().min(1),keyFile:z.string().min(1)});
/** Application identity/trust only. No engine address, pin or routing fallback. */
export async function loadApplicationTls(file:string):Promise<ApplicationTls>{
 let config:z.infer<typeof schema>;
 try{config=schema.parse(JSON.parse(await readFile(file,'utf8')) as unknown);}
 catch(error){throw new Error('Application TLS configuration could not be loaded ('+transportFailureCode(error,'invalid_configuration')+').');}
 const read=async(field:keyof typeof config)=>{try{return await readFile(resolve(dirname(file),config[field]),'utf8');}catch(error){throw new Error('Application TLS '+field+' could not be read ('+transportFailureCode(error,'read_error')+').');}};
 const [ca,cert,key]=await Promise.all([read('caFile'),read('certFile'),read('keyFile')]);return {ca,cert,key};
}
