import {setTimeout as delay} from 'node:timers/promises';
import type {EngineEgress,EngineRegistry,EngineContext} from '../src/modules/engines/index.js';
import type {EngineId,SourceId} from '../src/shared/kernel/index.js';
import {developmentEngineOptions} from './development-engine.js';

export async function assertDevelopmentApi(environment:Record<string,string|undefined>=process.env,request:typeof fetch=fetch):Promise<void>{
 const port=Number(environment.PORT??environment.API_PORT??'3000');
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('dev:demo requires a valid local API PORT or API_PORT.');
 try{
  const response=await request(`http://127.0.0.1:${port}/api/v1/auth/providers`,{signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('API unavailable');
  const body:unknown=await response.json();
  if(typeof body!=='object'||body===null||!('magicLink'in body)||typeof body.magicLink!=='boolean'||!('providers'in body)||!Array.isArray(body.providers))throw new Error('Not the API');
 }catch{throw new Error(`dev:demo requires the API running on port ${port}. Start npm run dev:api first; the API owns the background workers and listeners.`);}
}

export async function acknowledgeDevelopmentPolicy(egress:Pick<EngineEgress,'heartbeat'>,pin:string,ctx:EngineContext,engineId:EngineId):Promise<void>{
 const input={projectId:ctx.projectId,engineId,appliedVersion:null};
 const current=await egress.heartbeat(pin,input);if(!current.ok)throw current.error;
 const acknowledged=await egress.heartbeat(pin,{...input,appliedVersion:current.value.version});if(!acknowledged.ok)throw acknowledged.error;
 if(acknowledged.value.version!==current.value.version)throw new Error('Development source assignments changed during acknowledgment. Rerun dev:demo.');
}

/** Explicit local fixture acknowledgment; production engines retain their firewall lifecycle. */
export async function settleDevelopmentSource(registry:EngineRegistry,ctx:EngineContext,engineId:EngineId,sourceId:SourceId,serviceFile:string):Promise<void>{
 const {EngineEgress,PostgresEngineEgress}=await import('../src/modules/engines/index.js');
 const {createSourceRuntime}=await import('../src/modules/sources/infrastructure/source-runtime.js');
 const {withTenant}=await import('../src/platform/db/scope.js');
 const options=await developmentEngineOptions(serviceFile);
 if(!options.tls.certificatePin)throw new Error('Development engine certificate pin is missing.');
 const runtime=createSourceRuntime(registry);
 try{
  await acknowledgeDevelopmentPolicy(new EngineEgress(new PostgresEngineEgress(),projectId=>runtime.resume({...ctx,projectId})),options.tls.certificatePin,ctx,engineId);
  const deadline=Date.now()+90000;
  for(;;){
   await runtime.resume(ctx);const completed=await runtime.idle();if(!completed.ok)throw completed.error;
   const [source]=await withTenant(ctx,tx=>tx.query<{status:string;state:string|null}>(`SELECT status,(SELECT state FROM introspection_run WHERE source_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1) AS state FROM data_source s WHERE id=$1`,[sourceId]));
   if(source?.status==='connected'&&source.state==='complete')return;
   if(!source||source.status==='unreachable'||source.state==='failed'||source.state==='cancelled')throw new Error('Development source introspection failed; inspect the source before deciding treatments.');
   if(Date.now()>=deadline)throw new Error('Development source introspection did not complete within 90 seconds; no treatments were decided.');
   await delay(100);
  }
 }finally{await runtime.close();}
}
