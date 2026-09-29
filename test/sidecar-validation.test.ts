import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {validationRequest} from '../src/shared/execution-contract.js';
import {DuckDBValidationSessions,validationBudget} from '../sidecar/session/index.js';
import {StagedValidator} from '../sidecar/execution/application/validate.js';
const request=()=>validationRequest.parse({requestId:'validation-only',projectId:randomUUID(),poolId:randomUUID(),policyVersion:1,sql:'SELECT 1',namespace:{catalog:'memory',schema:'main'},objects:[],sources:[],entitlements:[],aggregateMinGroupSize:5,entitlementContext:null});
it('J-003: validation exposes binding but no statement execution capability',async()=>{
 const session=await new DuckDBValidationSessions().open(request(),new AbortController().signal);
 try{
  expect(Object.keys(session).sort()).toEqual(['build','close','columns','hasExternalState','objects','parse']);
  const parsed=await session.parse('SELECT 1');expect(parsed.kind).toBe('parsed');
  if(parsed.kind!=='parsed')throw new Error('Parse failed');
  expect(Object.keys(parsed).sort()).toEqual(['bind','kind','tree']);
  expect(await parsed.bind()).toBe(true);
 }finally{session.close();}
});
it('J-003: the fixed two-second deadline aborts validation independently of execution limits',async()=>{
 let deadline=0,stopped=false,closed=false;
 const validator=new StagedValidator({open:async(_request,signal)=>({build:async()=>'v1.4.3/d1dc88f950',columns:async()=>[],objects:async()=>[],hasExternalState:async()=>false,parse:async()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Interrupted')),{once:true})),close:()=>{closed=true;}})},{after:(ms,expire)=>{deadline=ms;const timer=setTimeout(expire,0);return()=>{stopped=true;clearTimeout(timer);};}},{record:()=>{}});
 expect(await validator.validate({...request(),limits:{memoryMb:999,threads:99,timeoutMs:999999,rowLimit:999,concurrency:99}})).toMatchObject({ok:false,error:{code:'budget_exceeded',message:'Validation exceeded its fixed 2-second deadline or was cancelled.'}});
 expect(deadline).toBe(2000);expect(stopped).toBe(true);expect(closed).toBe(true);expect(validationBudget).toEqual({memoryMb:128,threads:1,timeoutMs:2000});expect(Object.isFrozen(validationBudget)).toBe(true);
});
