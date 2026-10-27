/** Parent receives public associations, statuses and verification booleans, never shares or device tokens. */
import {fork} from 'node:child_process';
import {z} from 'zod';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import type {QueryOutput} from '../../src/shared/api/mcp.js';
import type {DeviceMapping} from './manifest.js';
export const ExchangeState=z.object({certificateId:z.number(),deviceName:z.string(),ok:z.boolean(),reason:z.string().nullable(),status:z.number().nullable(),body:z.string().nullable(),nextAttempt:z.number()});
export type ExchangeState=z.infer<typeof ExchangeState>;
export function custodyAgents(mappingFile:string,apiKey:string,event:(value:{agent:number;event:string;status:unknown})=>void,exchange:(value:ExchangeState,startup:boolean)=>void){
 const child=fork(new URL('./custody-agent.mjs',import.meta.url),[mappingFile],{execArgv:process.env.NODE_ENV==='production'?[]:['--import','tsx'],env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_EXTRA_CA_CERTS:process.env.NODE_EXTRA_CA_CERTS,OPINTEL_XQ_API_KEY:apiKey},stdio:['ignore','ignore','ignore','ipc']});
 let sequence=0,exited=false;const pending=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void}>();
 child.on('message',(raw:unknown)=>{
  const state=z.object({exchange:ExchangeState,startup:z.boolean()}).safeParse(raw);if(state.success){exchange(state.data.exchange,state.data.startup);return;}
  const message=z.object({event:z.string(),agent:z.number(),status:z.unknown()}).safeParse(raw);if(message.success){event(message.data);return;}
  const m=z.object({id:z.number(),value:z.unknown().optional(),error:z.string().optional()}).parse(raw);const request=pending.get(m.id);pending.delete(m.id);if(m.error)request?.reject(new Error(m.error));else request?.resolve(m.value);
 });
 const failed=()=>{exited=true;for(const p of pending.values())p.reject(new Error('Custody agent process exited'));pending.clear();};child.on('exit',failed);child.on('error',failed);
 const command=(message:Record<string,unknown>)=>new Promise<unknown>((resolve,reject)=>{if(exited){reject(new Error('Custody agent is not running'));return;}const requestId=++sequence;pending.set(requestId,{resolve,reject});child.send({...message,requestId});});
 let polling=false;const interval=setInterval(()=>{if(polling||exited)return;polling=true;void command({op:'poll'}).catch(()=>{}).finally(()=>{polling=false;});},30000);interval.unref();
 return {
  async associations(){return z.array(CertificateAssociation).parse(await command({op:'associations'}));},
  async verifyShare(association:Pick<DeviceMapping,'certificateId'|'deviceName'>,locator:string,expectedDigest:string){
   return z.strictObject({ok:z.boolean(),status:z.number().nullable()}).parse(await command({op:'verify-share',association,locator,expectedDigest}));
  },
  async connect(id:number,url:string,key:string,agentId:string,association:Pick<DeviceMapping,'certificateId'|'deviceName'>,stored?:CertificateAssociation){await command({op:'connect',id,url,key,agentId,association,stored});},
  async complete(id:number,output:z.infer<typeof QueryOutput>,expected:Record<string,unknown[]>){
   try{return z.object({ok:z.boolean(),stage:z.string().optional(),status:z.number().optional(),code:z.string().optional(),mismatch:z.boolean().optional(),verified:z.number().optional(),completed:z.number().optional()}).parse(await command({op:'complete',id,output,expected}));}
   catch{return {ok:false,stage:'certificate',code:'custody_agent_unavailable'};}
  },
  async close(){clearInterval(interval);try{if(!exited)await command({op:'close'});}finally{if(child.connected)child.disconnect();if(!exited)child.kill();}},
 };
}
