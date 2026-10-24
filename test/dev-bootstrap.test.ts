import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {assertDevelopmentApi,acknowledgeDevelopmentPolicy} from '../scripts/dev-demo-readiness.js';
import {prepareDevelopmentScanner} from '../scripts/development-scanner.js';
import {EngineEgress} from '../src/modules/engines/index.js';
import {ProjectId,UserId,EngineId,ok,err,DomainError} from '../src/shared/kernel/index.js';

describe('development bootstrap',()=>{
 it('requires a live API response up front and names the command when unavailable',async()=>{
  const request=vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
  await expect(assertDevelopmentApi({API_PORT:'4321'},request)).rejects.toThrow('Start npm run dev:api first');
  expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4321/api/v1/auth/providers');
  request.mockResolvedValue(new Response(JSON.stringify({magicLink:true,providers:[],enforced:null})));
  await expect(assertDevelopmentApi({API_PORT:'4321'},request)).resolves.toBeUndefined();
  request.mockResolvedValue(new Response('not the API'));
  await expect(assertDevelopmentApi({API_PORT:'4321'},request)).rejects.toThrow('requires the API running on port 4321');
 });
 it('prepares a missing scanner, reuses an existing artifact, and fails if preparation produces none',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dev-scanner-')),file=join(directory,'scanner');
  const prepare=vi.fn(async()=>{await writeFile(file,'fixture');});
  try{
   await expect(prepareDevelopmentScanner({file,prepare})).resolves.toBe(file);
   await expect(prepareDevelopmentScanner({file,prepare})).resolves.toBe(file);
   expect(prepare).toHaveBeenCalledTimes(1);
   await expect(prepareDevelopmentScanner({file:join(directory,'absent'),prepare:async()=>{}})).rejects.toThrow('scanner preparation failed');
  }finally{await rm(directory,{recursive:true,force:true});}
 });
 it('acknowledges the fetched policy before releasing the normal worker and propagates refusals',async()=>{
  const ctx={projectId:ProjectId('de000000-0000-4000-8000-000000000001'),userId:UserId('de000000-0000-4000-8000-000000000002')},engineId=EngineId('de000000-0000-4000-8000-000000000003');
  const order:string[]=[];
  const heartbeat=vi.fn(async(_pin:string,input:{appliedVersion:string|null})=>{order.push(input.appliedVersion??'fetch');return ok({policy:{version:'current-policy',assignments:[]},released:input.appliedVersion==='current-policy'});});
  const egress=new EngineEgress({heartbeat},async()=>{order.push('resume');});
  await acknowledgeDevelopmentPolicy(egress,'pin',ctx,engineId);
  expect(order).toEqual(['fetch','current-policy','resume']);
  await expect(acknowledgeDevelopmentPolicy({heartbeat:async()=>err(new DomainError('forbidden','Wrong pin'))},'wrong',ctx,engineId)).rejects.toThrow('Wrong pin');
 });
});
