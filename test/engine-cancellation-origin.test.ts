import {it,expect,vi} from 'vitest';
import {SidecarQueryExecution} from '../src/modules/mcp/infrastructure/execution-client.js';
vi.mock('../src/shared/infrastructure/engine-transport.js',()=>({engineConnect:(_url:URL,options:{signal:AbortSignal})=>new Promise((_resolve,reject)=>{
 if(options.signal.aborted)reject(new Error('cancelled'));else options.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});
})}));
const client=()=>new SidecarQueryExecution({baseUrl:'https://localhost',timeoutMs:5,tls:{ca:'synthetic',cert:'synthetic',key:'synthetic',certificatePin:'00'.repeat(32)}});
it('transport retains whether its own deadline or parent cancelled',async()=>{
 const parent=new AbortController();parent.abort();
 expect(await client().health(parent.signal)).toMatchObject({ok:false,error:{details:{cause:'parent_cancelled',cancellationOrigin:'parent'}}});
 // Keep the event loop live while AbortSignal.timeout's unreferenced timer fires.
 const keepAlive=setInterval(()=>{},20);
 try{expect(await client().health()).toMatchObject({ok:false,error:{details:{cause:'deadline_exceeded',cancellationOrigin:'transport_deadline'}}});}
 finally{clearInterval(keepAlive);}
});
