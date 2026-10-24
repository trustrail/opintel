import {z} from 'zod';
import {defineRoute} from './server.js';
import {DomainError} from '../../shared/kernel/index.js';

type Dependency='PostgreSQL'|'Redis'|'SpiceDB schema';
export class GatewayReadiness {
 private readonly pending=new Map<Dependency,Promise<void>>();
 constructor(private readonly probes:Readonly<Record<Dependency,()=>Promise<void>>>,private readonly deadlineMs=2500){}
 async unavailable():Promise<Dependency[]>{
  const names=Object.keys(this.probes) as Dependency[];
  const results=await Promise.all(names.map(async name=>{
   let work=this.pending.get(name);
   if(!work){
    work=Promise.resolve().then(this.probes[name]);this.pending.set(name,work);
    void work.finally(()=>this.pending.delete(name)).catch(()=>{});
   }
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Readiness timeout')),this.deadlineMs);})]);return true;}
   catch{return false;}finally{clearTimeout(timer);}
  }));
  return names.filter((_,index)=>!results[index]);
 }
 async requireReady():Promise<void>{
  const unavailable=await this.unavailable();
  if(unavailable.length){
   console.warn({event:'gateway.readiness_failed',dependencies:unavailable});
   throw new DomainError('dependency_unavailable','Gateway dependencies are not ready. Check PostgreSQL, Redis and the installed SpiceDB schema.');
  }
 }
}
export function readinessRoutes(readiness:GatewayReadiness){return [defineRoute({
 method:'GET',path:'/healthz',permission:'public',params:z.object({}),request:z.undefined(),response:z.object({status:z.literal('ready')}),
 handle:async()=>{await readiness.requireReady();return {headers:{'cache-control':'no-store'},body:{status:'ready' as const}};},
})];}
