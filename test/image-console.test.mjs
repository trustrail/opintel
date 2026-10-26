import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {createConsoleServer} from '../deploy/images/console.mjs';
const cleanup=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function serve(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}`;}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'opintel-console-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'index.html'),'<html>Console application</html>');await writeFile(join(root,'logo.png'),'image');return root;}
it('DEP-014: static console serves SPA/assets without an API proxy or TLS role',async()=>{
 const root=await fixture(),url=await serve(createConsoleServer({root}));
 for(const path of ['/sign-in','/auth/callback?token=synthetic','/auth/confirm-device'])expect(await (await fetch(url+path)).text()).toContain('Console application');
 expect(await (await fetch(url+'/logo.png')).text()).toBe('image');expect((await fetch(url+'/absent.png')).status).toBe(404);expect(await (await fetch(url+'/healthz')).text()).toBe('ok');
});
it('DEP-014: EACCES is a bounded request failure; later requests survive',async()=>{
 const root=await fixture(),log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  const url=await serve(createConsoleServer({root,read:file=>{if(!file.endsWith('logo.png'))return createReadStream(file);const stream=new Readable({read(){this.destroy(Object.assign(new Error('secret path sentinel'),{code:'EACCES'}));}});queueMicrotask(()=>stream.destroy(new Error('secret path sentinel')));return stream;}}));
  expect((await fetch(url+'/logo.png')).status).toBe(500);
  expect(await (await fetch(url+'/sign-in')).text()).toContain('Console application');
  expect(log).toHaveBeenCalledWith({event:'console.static_read_failed',timestamp:expect.any(String)});expect(JSON.stringify(log.mock.calls)).not.toContain('sentinel');
 }finally{log.mockRestore();}
});
