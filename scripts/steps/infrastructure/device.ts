import {fork} from 'node:child_process';
import {z} from 'zod';
import {CertificateAssociation} from '../../../src/shared/api/certificate-association.js';
export class ShareRefused extends Error {constructor(readonly share:'K1'|'K2',readonly cause:string){super(`${share} refused: ${cause}`);}}
export function deviceAgent(){
 const child=fork(new URL('./device-worker.mjs',import.meta.url),[],{execArgv:process.env.NODE_ENV==='production'?[]:['--import','tsx'],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_EXTRA_CA_CERTS:process.env.NODE_EXTRA_CA_CERTS},stdio:['ignore','ignore','ignore','ipc']});
 let sequence=0;const waiting=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
 child.on('message',(raw:unknown)=>{const reply=z.object({id:z.number(),value:z.unknown().optional(),error:z.object({phase:z.string(),status:z.number().nullable()}).optional()}).parse(raw),pending=waiting.get(reply.id);waiting.delete(reply.id);if(reply.error)pending?.reject(new ShareRefused('K1',`XQ ${reply.error.phase}${reply.error.status===null?'':` (HTTP ${reply.error.status})`}`));else pending?.resolve(reply.value);});
 const fail=()=>{for(const pending of waiting.values())pending.reject(new ShareRefused('K1','agent process exited'));waiting.clear();};child.on('exit',fail);child.on('error',fail);
 const command=(message:Record<string,unknown>)=>new Promise<unknown>((resolve,reject)=>{if(!child.connected){reject(new ShareRefused('K1','agent process is not connected'));return;}const id=++sequence;waiting.set(id,{resolve,reject});child.send({...message,id});});
 return {async exchange(certificateId:number,deviceName:string,directory:string,apiKey:string){return CertificateAssociation.parse(await command({operation:'exchange',certificateId,deviceName,directory,apiKey}));},async share(certificateId:number,locator:string){const result=z.object({share:z.string().regex(/^[A-Za-z0-9_-]{43}$/u)}).parse(await command({operation:'share',certificateId,locator}));return Buffer.from(result.share,'base64url');},close(){if(child.connected)child.disconnect();child.kill();}};
}
