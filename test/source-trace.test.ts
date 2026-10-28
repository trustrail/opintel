import {it,expect,vi} from 'vitest';
import {withSourceTrace,lastSourcePhase,sourceOperationEvent} from '../src/shared/infrastructure/source-trace.js';
it('source phase tracking stays request-local across asynchronous work',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  const result=await Promise.all(['connect','metadata'].map(operation=>withSourceTrace(async()=>{
   sourceOperationEvent('trace',operation==='connect'?'connect':'metadata','start',1);await Promise.resolve();return lastSourcePhase()?.failure.operation;
  })));
  expect(result).toEqual(['connect','metadata']);expect(lastSourcePhase()).toBeUndefined();
 }finally{log.mockRestore();}
});
