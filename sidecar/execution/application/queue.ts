import { DomainError,err,ok,type PoolId,type ProjectId,type Result } from '../../../src/shared/kernel/index.js';
type Waiter={grant:()=>void;cancel:()=>void};
type State={active:number;waiting:Waiter[]};
/** Host-scoped FIFO. A queued request owns neither a DuckDB instance nor a source connection. */
export class ExecutionQueue {
 private lastWaitMs=0;private maxWaitMs=0;private saturated=0;
 snapshot(){return {active:[...this.pools.values()].reduce((n,p)=>n+p.active,0),waiting:[...this.pools.values()].reduce((n,p)=>n+p.waiting.length,0),lastWaitMs:this.lastWaitMs,maxWaitMs:this.maxWaitMs,saturated:this.saturated};}
 private readonly pools=new Map<string,State>();
 async acquire(project:ProjectId,pool:PoolId,concurrency:number,maxQueuedExecutions:number,signal:AbortSignal,maxWaitMs=Infinity):Promise<Result<()=>void>>{
  const started=performance.now();
  const observed=()=>{this.lastWaitMs=Math.max(0,performance.now()-started);this.maxWaitMs=Math.max(this.maxWaitMs,this.lastWaitMs);return this.lastWaitMs;};
  const saturated=()=>{this.saturated=Math.min(Number.MAX_SAFE_INTEGER,this.saturated+1);return err(new DomainError('engine_saturated','The engine admission queue is saturated. Retry later.',{cause:'engine_saturated',queueWaitMs:observed(),queueMaxWaitMs:maxWaitMs},true));};
  const key=project+':'+pool;
  let state=this.pools.get(key);if(!state){state={active:0,waiting:[]};this.pools.set(key,state);}
  const current=state;
  const clean=()=>{if(current.active===0&&current.waiting.length===0)this.pools.delete(key);};
  const cancelled=()=>err(new DomainError('budget_exceeded','The execution was cancelled while waiting for the pool.',{cause:'parent_cancelled',resource:'queue'},true));
  if(signal.aborted){clean();return cancelled();}
  const release=()=>{let done=false;return ()=>{if(done)return;done=true;current.active--;const next=current.waiting.shift();if(next)next.grant();clean();};};
  if(current.active<concurrency){current.active++;return ok(release());}
  if(current.waiting.length>=maxQueuedExecutions)return err(new DomainError('budget_exceeded',`maxQueuedExecutions is ${maxQueuedExecutions}; the pool queue is full at depth ${current.waiting.length}. Retry later.`,{cause:'queue_full',setting:'maxQueuedExecutions',value:maxQueuedExecutions,depth:current.waiting.length},true));
  return new Promise(resolve=>{
   let timer:ReturnType<typeof setTimeout>|undefined;
   const detach=()=>{clearTimeout(timer);signal.removeEventListener('abort',waiter.cancel);};
   const expire=()=>{const index=current.waiting.indexOf(waiter);if(index<0)return;current.waiting.splice(index,1);detach();clean();resolve(saturated());};
   const waiter:Waiter={grant:()=>{detach();if(observed()>=maxWaitMs){clean();resolve(saturated());const next=current.waiting.shift();next?.grant();return;}current.active++;resolve(ok(release()));},cancel:()=>{const index=current.waiting.indexOf(waiter);if(index>=0)current.waiting.splice(index,1);detach();observed();clean();resolve(cancelled());}};
   current.waiting.push(waiter);signal.addEventListener('abort',waiter.cancel,{once:true});if(Number.isFinite(maxWaitMs))timer=setTimeout(expire,maxWaitMs);
  });
 }
}
