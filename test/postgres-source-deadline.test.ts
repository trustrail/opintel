import { beforeEach,expect,it,vi } from 'vitest';
import { SecretRef } from '../src/platform/secrets/types.js';
import { PostgresSourceScope,SourceTimeout,SourceBusy,SourceCancelled,type SourceDeadlineClock } from '../sidecar/infrastructure/postgres-source-scope.js';
import { PostgresConnector } from '../sidecar/infrastructure/postgres-connector.js';
import { randomUUID } from 'node:crypto';

type FakeConnection={ended:boolean;statements:string[]};
const driver=vi.hoisted(()=>({clients:[] as FakeConnection[]}));
vi.mock('pg',()=>({Client:class {
 ended=false;statements:string[]=[];
 constructor(){driver.clients.push(this);}
 on(){return this;}
 async connect(){}
 async query(sql:string){this.statements.push(sql);return {rows:sql.includes('pg_backend_pid')?[{pid:123}]:sql==='SELECT 1 AS ok'?[{ok:1}]:[]};}
 async end(){this.ended=true;}
}}));
class ManualDeadlineClock implements SourceDeadlineClock {
 private now=0;private sequence=0;
 private tasks=new Map<number,{at:number;expire:()=>void}>();
 after(milliseconds:number,expire:()=>void){const id=++this.sequence;this.tasks.set(id,{at:this.now+milliseconds,expire});return ()=>{this.tasks.delete(id);};}
 advance(milliseconds:number){this.now+=milliseconds;for(const [id,task] of [...this.tasks].sort((a,b)=>a[1].at-b[1].at)){if(task.at>this.now)break;this.tasks.delete(id);task.expire();}}
 get pending(){return this.tasks.size;}
}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const ref=SecretRef('secret://test/source');
const limits={maxConnectionsPerSource:1,statementTimeoutMs:5000,operationTimeoutMs:100};
beforeEach(()=>{driver.clients.length=0;});

it('C.4: the operation deadline fires at the injected boundary, cancels the backend and releases the slot',async()=>{
 const clock=new ManualDeadlineClock(),scope=new PostgresSourceScope({resolve:async()=> 'test-only-credential'},limits,clock);
 const ready=deferred<void>(),work=deferred<unknown[]>();let settled=false;
 const running=scope.run('source',ref,async()=>{ready.resolve();return work.promise;});
 const finished=running.then(()=>{settled=true;throw new Error('Expected timeout');},error=>{settled=true;return error as unknown;});
 await ready.promise;
 await expect(scope.run('source',ref,async()=>{})).rejects.toBeInstanceOf(SourceBusy);
 clock.advance(99);await Promise.resolve();expect(settled).toBe(false);
 clock.advance(1);const error=await finished;
 expect(error).toBeInstanceOf(SourceTimeout);expect(error).toMatchObject({name:'SourceTimeout',message:'Source operation exceeded its deadline.'});
 expect(clock.pending).toBe(0);expect(driver.clients.every(client=>client.ended)).toBe(true);
 expect(driver.clients.flatMap(client=>client.statements)).toContain('SELECT pg_cancel_backend($1)');
 // The losing operation can still reject after cleanup. The race owns that
 // rejection too; no unhandled-rejection listener or catch is needed on work.
 work.reject(new Error('Late operation failure'));
 await new Promise<void>(resolve=>setImmediate(resolve));
 expect(await scope.run('source',ref,session=>session.query('SELECT 1 AS ok'))).toEqual([{ok:1}]);
 expect(clock.pending).toBe(0);
});
it('C.4: success clears the deadline and advancing past it cannot reject a completed operation',async()=>{
 const clock=new ManualDeadlineClock(),scope=new PostgresSourceScope({resolve:async()=> 'test-only-credential'},limits,clock);
 expect(await scope.run('source',ref,async()=> 'done')).toBe('done');expect(clock.pending).toBe(0);
 clock.advance(1000);await new Promise<void>(resolve=>setImmediate(resolve));
 expect(driver.clients).toHaveLength(1);expect(driver.clients[0]!.ended).toBe(true);
 expect(await scope.run('source',ref,async()=> 'reused')).toBe('reused');
});
it('C.4: slow credential resolution expires without opening a connection later',async()=>{
 const clock=new ManualDeadlineClock(),credential=deferred<string>(),work=vi.fn(async()=> 'unused');
 const scope=new PostgresSourceScope({resolve:()=>credential.promise},limits,clock);
 const running=scope.run('source',ref,work),finished=expect(running).rejects.toThrow('Source operation exceeded its deadline.');
 clock.advance(100);await finished;credential.resolve('must-not-be-opened');
 await new Promise<void>(resolve=>setImmediate(resolve));
 expect(driver.clients).toHaveLength(0);expect(work).not.toHaveBeenCalled();expect(clock.pending).toBe(0);
});
it('C.4: abort clears the operation deadline and closes its connections',async()=>{
 const clock=new ManualDeadlineClock(),scope=new PostgresSourceScope({resolve:async()=> 'test-only-credential'},limits,clock),controller=new AbortController();
 const ready=deferred<void>(),work=deferred<void>();
 const finished=expect(scope.run('source',ref,async()=>{ready.resolve();return work.promise;},controller.signal)).rejects.toBeInstanceOf(SourceCancelled);
 await ready.promise;controller.abort();await finished;work.resolve();clock.advance(1000);
 expect(clock.pending).toBe(0);expect(driver.clients.every(client=>client.ended)).toBe(true);
});
it('the connector maps the timeout response without logging the raw error',async()=>{
 const clock=new ManualDeadlineClock(),credential=deferred<string>();
 const scope=new PostgresSourceScope({resolve:()=>credential.promise},limits,clock);
 const connector=new PostgresConnector(scope,{record:async()=>{}});
 const logs=[vi.spyOn(console,'log'),vi.spyOn(console,'info'),vi.spyOn(console,'warn'),vi.spyOn(console,'error')];
 try{
  const response=connector.testConnection({requestId:'deadline',projectId:randomUUID(),sourceId:randomUUID(),credentialRef:ref,payload:{}});
  clock.advance(100);
  expect(await response).toEqual({ok:true,value:{reachable:false,reason:'Source operation timed out.'}});
  for(const log of logs)expect(log).not.toHaveBeenCalled();
  credential.resolve('must-not-be-opened');await new Promise<void>(resolve=>setImmediate(resolve));
 }finally{for(const log of logs)log.mockRestore();}
});
