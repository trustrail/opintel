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
async function fixture(){const root=await mkdtemp(join(tmpdir(),'opintel-console-'));cleanup.push(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'index.html'),'<html>Console application</html>');await mkdir(join(root,'legacy'),{recursive:true});await writeFile(join(root,'legacy/index.html'),'<html>Legacy console</html>');await writeFile(join(root,'logo.png'),'image');return root;}
it('DEP-014: static console serves SPA/assets without an API proxy or TLS role',async()=>{
 const root=await fixture(),url=await serve(createConsoleServer({root}));
 for(const path of ['/sign-in','/auth/callback?token=synthetic','/auth/confirm-device'])expect(await (await fetch(url+path)).text()).toContain('Legacy console');
 expect(await (await fetch(url+'/logo.png')).text()).toBe('image');expect((await fetch(url+'/absent.png')).status).toBe(404);expect(await (await fetch(url+'/healthz')).text()).toBe('ok');
});
it('DEP-014: EACCES is a bounded request failure; later requests survive',async()=>{
 const root=await fixture(),log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  const url=await serve(createConsoleServer({root,read:file=>{if(!file.endsWith('logo.png'))return createReadStream(file);const stream=new Readable({read(){this.destroy(Object.assign(new Error('secret path sentinel'),{code:'EACCES'}));}});queueMicrotask(()=>stream.destroy(new Error('secret path sentinel')));return stream;}}));
  expect((await fetch(url+'/logo.png')).status).toBe(500);
  expect(await (await fetch(url+'/sign-in')).text()).toContain('Legacy console');
  expect(log).toHaveBeenCalledWith({event:'console.static_read_failed',timestamp:expect.any(String)});expect(JSON.stringify(log.mock.calls)).not.toContain('sentinel');
 }finally{log.mockRestore();}
});

it('default root and frozen legacy have separate SPA/assets; old project and auth links redirect',async()=>{
 const root=await fixture();await mkdir(join(root,'legacy/assets'),{recursive:true});await writeFile(join(root,'legacy/assets/index-test.js'),'legacy-bundle');const url=await serve(createConsoleServer({root}));
 expect(await(await fetch(url+'/')).text()).toContain('Console application');
 for(const path of ['/legacy/','/legacy/projects/p/observations'])expect(await(await fetch(url+path)).text()).toContain('Legacy console');
 expect(await(await fetch(url+'/legacy/assets/index-test.js')).text()).toBe('legacy-bundle');expect((await fetch(url+'/legacy/assets/missing.js')).status).toBe(404);
 for(const [old,destination] of [['/console-next/?project=p','/?project=p'],['/projects/p/dashboard','/?project=p'],['/projects/p/observations','/legacy/projects/p/observations'],['/projects/p/pools/q/agents/name%2Fpart','/legacy/projects/p/pools/q/agents/name%2Fpart'],['/auth/callback?token=opaque','/legacy/auth/callback?token=opaque']])expect((await fetch(url+old,{redirect:'manual'})).headers.get('location')).toBe(destination);
 expect((await fetch(url+'/releases')).status).toBe(404);
});
it('console runtime contract permits only the root and legacy built assets plus the exact self-hosted font/licence',async()=>{
 const p=JSON.parse(await readFile('deploy/images/runtime-policy.json','utf8')).targets.console,allowed=name=>p.files.includes(name)||p.patterns.some(pattern=>new RegExp('^'+pattern+'$','u').test(name));
 for(const name of ['work/dist/index.html','work/dist/legacy/index.html','work/dist/legacy/assets/index-test.js','work/dist/assets/index-test.css','work/dist/fonts/InterVariable.woff2','work/dist/fonts/OFL.txt'])expect(allowed(name)).toBe(true);
 for(const name of ['work/dist/legacy/src/screen.tsx','work/dist/legacy/.env','work/dist/legacy/assets/index-test.js.map','work/dist/other/index.html','work/dist/fonts/private.txt','work/dist/fonts/other.woff2'])expect(allowed(name)).toBe(false);
});
