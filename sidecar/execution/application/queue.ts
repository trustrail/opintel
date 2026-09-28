import { DomainError,err,ok,type PoolId,type ProjectId,type Result } from '../../../src/shared/kernel/index.js';
type Waiter={grant:()=>void;cancel:()=>void};
type State={active:number;waiting:Waiter[]};
/** Host-scoped FIFO. A queued request owns neither a DuckDB instance nor a source connection. */
export class ExecutionQueue {
 private readonly pools=new Map<string,State>();
 async acquire(project:ProjectId,pool:PoolId,concurrency:number,maxQueuedExecutions:number,signal:AbortSignal):Promise<Result<()=>void>>{
  const key=project+':'+pool;
  let state=this.pools.get(key);if(!state){state={active:0,waiting:[]};this.pools.set(key,state);}
  const current=state;
  const clean=()=>{if(current.active===0&&current.waiting.length===0)this.pools.delete(key);};
  const cancelled=()=>err(new DomainError('budget_exceeded','The execution was cancelled while waiting for the pool.',{resource:'queue'},true));
  if(signal.aborted){clean();return cancelled();}
  const release=()=>{let done=false;return ()=>{if(done)return;done=true;current.active--;const next=current.waiting.shift();if(next)next.grant();clean();};};
  if(current.active<concurrency){current.active++;return ok(release());}
  if(current.waiting.length>=maxQueuedExecutions)return err(new DomainError('budget_exceeded',`maxQueuedExecutions is ${maxQueuedExecutions}; the pool queue is full at depth ${current.waiting.length}. Retry later.`,{setting:'maxQueuedExecutions',value:maxQueuedExecutions,depth:current.waiting.length},true));
  return new Promise(resolve=>{
   const waiter:Waiter={grant:()=>{signal.removeEventListener('abort',waiter.cancel);current.active++;resolve(ok(release()));},cancel:()=>{const index=current.waiting.indexOf(waiter);if(index>=0)current.waiting.splice(index,1);signal.removeEventListener('abort',waiter.cancel);clean();resolve(cancelled());}};
   current.waiting.push(waiter);signal.addEventListener('abort',waiter.cancel,{once:true});
  });
 }
}
