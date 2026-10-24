import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {createConsoleServer} from '../deploy/images/console.mjs';

const cleanup=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function serve(server){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 cleanup.push(()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
 return `http://127.0.0.1:${server.address().port}`;
}
it('DEP-004/008: console keeps normal login pages in the SPA and proxies only API/OIDC transport and readiness',async()=>{
 const root=await mkdtemp(join(tmpdir(),'opintel-console-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'index.html'),'<html>Console application</html>');
 const calls=[];
 const upstream=await serve(createServer((request,response)=>{calls.push(request.url);response.end('upstream');}));
 const consoleUrl=await serve(createConsoleServer({root,upstream:new URL(upstream)}));
 for(const path of ['/sign-in','/auth/callback?token=synthetic','/auth/confirm-device?token=synthetic']){
  expect(await (await fetch(consoleUrl+path)).text()).toContain('Console application');
 }
 expect(calls).toEqual([]);
 for(const path of ['/api/v1/me','/auth/oidc/oidc:example/start','/mcp/v1/p/project','/healthz'])expect(await (await fetch(consoleUrl+path)).text()).toBe('upstream');
 expect(calls).toHaveLength(4);
});
it('DEP-004: console refuses unsupported or credential-bearing upstream URLs',()=>{
 for(const url of ['file:///tmp/api','http://operator:secret@localhost'])expect(()=>createConsoleServer({upstream:new URL(url)})).toThrow('without credentials');
});
