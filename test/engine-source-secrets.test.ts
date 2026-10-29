import {mkdtemp,rm,readFile,writeFile,stat,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,it,expect,vi} from 'vitest';
import {FileSourceSecrets} from '../sidecar/infrastructure/source-secrets.js';
import {EnvironmentSecretStore,SecretRef} from '../src/platform/secrets/index.js';
import {engineSources,sourceUri} from '../scripts/operator/engine-sources.js';
const roots:string[]=[];
async function fixture(){const root=await mkdtemp(join(tmpdir(),'source-secrets-'));roots.push(root);return {root,directory:join(root,'sources')};}
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
it('ES-001: persists only on the Engine with private modes, lists names and removes explicitly',async()=>{
 const {directory}=await fixture(),store=new FileSourceSecrets(directory);
 const ref=await store.store('sources/payroll','postgresql://synthetic');
 expect(ref).toBe('secret://sources/payroll');expect((await stat(directory)).mode&0o777).toBe(0o700);expect((await stat(join(directory,'payroll'))).mode&0o777).toBe(0o600);
 expect(await new FileSourceSecrets(directory).resolve(ref)).toBe('postgresql://synthetic');expect(await store.list()).toEqual(['payroll']);
 await expect(store.store('sources/payroll','replacement')).rejects.toMatchObject({code:'EEXIST'});expect(await store.resolve(ref)).toBe('postgresql://synthetic');
 await store.remove('payroll');expect(await store.list()).toEqual([]);await expect(store.resolve(ref)).rejects.toMatchObject({code:'ENOENT'});
});
it('ES-002: preserves every printable password character, including spaces and punctuation',()=>{
 const password=Array.from({length:95},(_,n)=>String.fromCharCode(n+32)).join('')+'!$#%=';
 const uri=new URL(sourceUri({host:'::1',port:'5432',database:'db /%',user:'u:@%',password}));
 expect(decodeURIComponent(uri.password)).toBe(password);expect(decodeURIComponent(uri.username)).toBe('u:@%');expect(decodeURIComponent(uri.pathname.slice(1))).toBe('db /%');expect(uri.hostname).toBe('[::1]');
 const unicode='é🔑 !$#%=';expect(decodeURIComponent(new URL(sourceUri({host:'localhost',port:5432,database:'données',user:'lecteur',password:unicode})).password)).toBe(unicode);
});
it('ES-003: source namespace never falls back to environment credentials',async()=>{
 const {directory}=await fixture(),store=new FileSourceSecrets(directory,new EnvironmentSecretStore({OPINTEL_SECRET_TEST_SOURCE:'legacy',OPINTEL_SECRET_SOURCES_MISSING:'must-not-fallback'}));
 expect(await store.resolve(SecretRef('secret://test/source'))).toBe('legacy');await store.list();await expect(store.resolve(SecretRef('secret://sources/missing'))).rejects.toMatchObject({code:'ENOENT'});
});
it('ES-004: rejects traversal, loose permissions and links without disclosing content',async()=>{
 const {root,directory}=await fixture(),store=new FileSourceSecrets(directory);await store.store('sources/private','SYNTHETIC_SECRET');
 for(const path of ['../escape','sources/../../escape','secret://sources/../escape'])await expect(store.store(path,'value')).rejects.toThrow();
 await chmod(join(directory,'private'),0o644);await expect(store.resolve(SecretRef('secret://sources/private'))).rejects.toThrow('mode-600');
 await symlink(join(directory,'private'),join(directory,'link'));await expect(store.resolve(SecretRef('secret://sources/link'))).rejects.toThrow();
 await symlink(directory,join(root,'linked'));await expect(new FileSourceSecrets(join(root,'linked')).list()).rejects.toThrow('mode-700');
 await chmod(directory,0o755);await expect(store.list()).rejects.toThrow('mode-700');
});
it('ES-005: private NUL-delimited operator input prints only the reference, never fields or credentials',async()=>{
 const {root,directory}=await fixture(),file=join(root,'input'),password=' synthet!$#%= ';
 await writeFile(file,['db.example.invalid','5432','customer','reader',password,''].join('\0'),{mode:0o600});
 const output=vi.fn(),info=vi.spyOn(console,'info'),error=vi.spyOn(console,'error');
 await engineSources(directory,['add','customer',file],output);expect(output.mock.calls).toEqual([['secret://sources/customer']]);
 const uri=new URL(await readFile(join(directory,'customer'),'utf8'));expect(decodeURIComponent(uri.password)).toBe(password);expect(info).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
 output.mockClear();await engineSources(directory,['list'],output);expect(output.mock.calls).toEqual([['customer']]);await engineSources(directory,['remove','customer'],output);expect(await new FileSourceSecrets(directory).list()).toEqual([]);
});
it('ES-006: refuses insecure input and malformed fields without creating a reference',async()=>{
 const {root,directory}=await fixture(),file=join(root,'input');await writeFile(file,'bad',{mode:0o644});
 await expect(engineSources(directory,['add','x',file])).rejects.toThrow('private');await chmod(file,0o600);
 await expect(engineSources(directory,['add','x',file])).rejects.toThrow('Invalid private connection input');
 expect(()=>sourceUri({host:'db.invalid/?x',port:5432,database:'db',user:'user',password:'secret'})).toThrow();
 expect(()=>sourceUri({host:'db.invalid',port:5432,database:'db',user:'user',password:'line\nfeed'})).toThrow('printable');
});
