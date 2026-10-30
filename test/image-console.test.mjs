import {mkdtemp,writeFile,rm,mkdir,readFile} from 'node:fs/promises';
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

it('parallel console uses its own index/assets while the current console stays intact',async()=>{
 const root=await fixture();await mkdir(join(root,'console-next/assets'),{recursive:true});await writeFile(join(root,'console-next/index.html'),'<html>Parallel console</html>');await writeFile(join(root,'console-next/assets/index-test.js'),'console-next-bundle');const url=await serve(createConsoleServer({root}));
 for(const path of ['/console-next','/console-next/','/console-next/settings'])expect(await(await fetch(url+path)).text()).toContain('Parallel console');
 expect(await(await fetch(url+'/console-next/assets/index-test.js')).text()).toBe('console-next-bundle');expect((await fetch(url+'/console-next/assets/missing.js')).status).toBe(404);expect(await(await fetch(url+'/sign-in')).text()).toContain('Console application');
});
it('console runtime contract permits only the parallel built index and hashed JS/CSS paths',async()=>{
 const p=JSON.parse(await readFile('deploy/images/runtime-policy.json','utf8')).targets.console,allowed=name=>p.files.includes(name)||p.patterns.some(pattern=>new RegExp('^'+pattern+'$','u').test(name));
 for(const name of ['work/dist/console-next/index.html','work/dist/console-next/assets/index-test.js','work/dist/console-next/assets/index-test.css'])expect(allowed(name)).toBe(true);
 for(const name of ['work/dist/console-next/src/screen.tsx','work/dist/console-next/.env','work/dist/console-next/assets/index-test.js.map','work/dist/other/index.html'])expect(allowed(name)).toBe(false);
});
