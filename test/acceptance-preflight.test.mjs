import {createServer} from 'node:net';
import {expect,it,vi} from 'vitest';
import {acceptancePortPreflight} from '../scripts/images/acceptance-preflight.mjs';
const empty=command=>({status:command==='lsof'?1:0,stdout:'',stderr:''});
it('acceptance names a Docker install holding a required port',async()=>{
 await expect(acceptancePortPreflight([3100],{run:()=>({status:0,stdout:'customer-engine-1 (customer-engine)'})})).rejects.toThrow('Docker install customer-engine-1 (customer-engine)');
});
it('acceptance names a non-Docker loopback listener before trying a wildcard bind',async()=>{
 const run=vi.fn(command=>command==='lsof'?{status:0,stdout:'node 3175 operator TCP 127.0.0.1:3100 (LISTEN)'}:empty(command));
 await expect(acceptancePortPreflight([3100],{run})).rejects.toThrow('node 3175 operator TCP 127.0.0.1:3100');
});
it('acceptance rejects a real loopback-only listener even when owner discovery returns no records',async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await expect(acceptancePortPreflight([server.address().port],{run:empty})).rejects.toThrow('preflight failed on 127.0.0.1 (EADDRINUSE)');}
 finally{await new Promise(resolve=>server.close(resolve));}
});
it('acceptance refuses failed listener inspection',async()=>{
 await expect(acceptancePortPreflight([3100],{run:command=>command==='lsof'?{status:null,stdout:'',error:{code:'ETIMEDOUT'}}:empty(command)})).rejects.toThrow('could not inspect host listeners');
});
