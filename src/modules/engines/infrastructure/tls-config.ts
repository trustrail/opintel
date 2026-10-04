import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import type {ApplicationTls} from '../application/registry.js';
const schema=z.strictObject({caFile:z.string().min(1),certFile:z.string().min(1),keyFile:z.string().min(1)});
/** Application identity/trust only. No engine address, pin or routing fallback. */
export async function loadApplicationTls(file:string):Promise<ApplicationTls>{try{const c=schema.parse(JSON.parse(await readFile(file,'utf8')) as unknown);const read=(p:string)=>readFile(resolve(dirname(file),p),'utf8');const [ca,cert,key]=await Promise.all([read(c.caFile),read(c.certFile),read(c.keyFile)]);return {ca,cert,key};}catch{throw new Error('Application TLS identity or trust material is missing or invalid.');}}
