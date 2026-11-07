import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {CredentialId} from '../src/modules/pools/index.js';
const fake=vi.hoisted(()=>({worker:undefined as {emit:(event:string,value:unknown)=>boolean}|undefined}));
vi.mock('node:worker_threads',async()=>{
 const {EventEmitter}=await import('node:events');
 return {Worker:class extends EventEmitter{constructor(){super();fake.worker=this;}terminate(){return Promise.resolve(0);}}};
});
import {XqReleaseProvider} from '../src/modules/release-custody/infrastructure/xq-provider.js';
it('an outer worker deadline retains its last observed TLS phase and enrollment correlation',async()=>{
 vi.useFakeTimers();const log=vi.spyOn(console,'warn').mockImplementation(()=>{}),correlation={enrollmentId:randomUUID(),credentialId:CredentialId(randomUUID())};
 try{
  const provider=new XqReleaseProvider({apiKey:'PRIVATE_SENTINEL',dashboardApiKey:'PRIVATE_SENTINEL',senderAlias:'PRIVATE_SENTINEL',senderAccessToken:'PRIVATE_SENTINEL'},'PRIVATE_SENTINEL','https://provider.invalid/redeem');
  const pending=provider.escrow(Buffer.alloc(32),'PRIVATE_SENTINEL',120,true,undefined,correlation);const refused=expect(pending).rejects.toMatchObject({failure:{kind:'worker_deadline_exceeded'}});
  fake.worker?.emit('message',{type:'xq-progress',phase:'TLS',subcall:'subscription',attempt:2,written:false});
  await vi.advanceTimersByTimeAsync(20000);await refused;
  expect(log).toHaveBeenCalledTimes(1);expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({event:'custody.xq_operation_failed',kind:'worker_deadline_exceeded',phase:'TLS',attempt:2,written:false,...correlation});
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_SENTINEL');
 }finally{vi.useRealTimers();log.mockRestore();}
});
