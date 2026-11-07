import {withEngineCall,validationStages} from '../src/shared/engine-phase.js';
import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
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
 const validator=new StagedValidator({open:async(_request,signal)=>({build:async()=>'v1.5.6/069cc9f9b5',columns:async()=>[],objects:async()=>[],hasExternalState:async()=>false,parse:async()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Interrupted')),{once:true})),close:()=>{closed=true;}})},{after:(ms,expire)=>{deadline=ms;const timer=setTimeout(expire,0);return()=>{stopped=true;clearTimeout(timer);};}},{record:()=>{}});
 expect(await validator.validate({...request(),limits:{memoryMb:999,threads:99,timeoutMs:999999,rowLimit:999,concurrency:99}})).toMatchObject({ok:false,error:{code:'budget_exceeded',message:'Validation exceeded its fixed 2-second deadline or was cancelled.'}});
 expect(deadline).toBe(2000);expect(stopped).toBe(true);expect(closed).toBe(true);expect(validationBudget).toEqual({memoryMb:128,threads:1,timeoutMs:2000});expect(Object.isFrozen(validationBudget)).toBe(true);
});

it('validation progress preserves gateway correlation, bounded stages and durations without SQL or values',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{}),callId=randomUUID();
 try{
  const validator=new StagedValidator();const result=await withEngineCall(callId,()=>validator.validate({...request(),sql:"SELECT 'PRIVATE_VALUE_SENTINEL'"}));
  expect(result.ok).toBe(true);
  const phases=log.mock.calls.map(([r])=>r as {event:string;callId?:string;stage?:string;durationMs?:number;state?:string});
  const progress=phases.filter(r=>r.event==='engine.request_phase'&&r.stage);
  expect(progress.length).toBeGreaterThan(0);
  for(const r of progress){expect(r.callId).toBe(callId);expect(validationStages).toContain(r.stage);expect(r.durationMs).toBeGreaterThanOrEqual(0);}
  for(const stage of ['duckdb_open','instance_create','connection_open','namespace','search_path','harden','parse','prepare','session_close'])expect(progress).toContainEqual(expect.objectContaining({stage,state:'end'}));
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_VALUE_SENTINEL');expect(JSON.stringify(log.mock.calls)).not.toContain('SELECT');
 }finally{log.mockRestore();}
});
