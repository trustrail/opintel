import process from 'node:process';
import {describe,it,expect,vi} from 'vitest';
import {gatePreflight,runPreflightCommand,parseAvailableMemory,availableMemory,pinnedGateImages,ensureGateImage,GatePrerequisiteError,bootstrapFailure} from '../scripts/gate-preflight.mjs';

const memory=()=>1024**3;
const images=async()=>({redis:'redis:7-alpine@sha256:'+'a'.repeat(64),spicedb:'authzed/spicedb:latest@sha256:'+'b'.repeat(64)});
function fixture(){
 const run=vi.fn(async(_command,args)=>args[0]==='info'?String(8*1024**3):args[0]==='compose'?'postgres\nredis\n':'sha256:'+'c'.repeat(64));
 return {run,probe:vi.fn().mockResolvedValue(undefined),memory,images};
}
describe('gate service preflight',()=>{
 it('refuses below 1 GiB before inspecting or starting services',async()=>{
  const dependencies=fixture();
  await expect(gatePreflight({...dependencies,memory:()=>1024**3-1})).rejects.toThrow('at least 1 GiB required');
  expect(dependencies.run).not.toHaveBeenCalled();expect(dependencies.probe).not.toHaveBeenCalled();
 });
 it('accepts exactly 1 GiB and records host and Docker memory',async()=>{
  await expect(gatePreflight(fixture())).resolves.toMatchObject({memory:{availableBytes:1024**3,minimumAvailableBytes:1024**3},docker:{bytes:8*1024**3}});
 });
 it('fails closed when the available-memory reading is invalid',async()=>{
  const dependencies=fixture();
  await expect(gatePreflight({...dependencies,memory:()=>NaN})).rejects.toThrow('cannot determine available RAM');
  expect(dependencies.run).not.toHaveBeenCalled();expect(dependencies.probe).not.toHaveBeenCalled();
 });
 it('starts only stopped Compose services and probes both dependencies',async()=>{
  const dependencies=fixture(),base=dependencies.run.getMockImplementation();
  dependencies.run.mockImplementation((command,args,...rest)=>args[0]==='compose'?Promise.resolve(args[1]==='ps'?'postgres\n':''):base(command,args,...rest));
  await expect(gatePreflight(dependencies)).resolves.toMatchObject({started:['redis'],postgres:'reachable',redis:'reachable'});
  expect(dependencies.run.mock.calls.find(([,args])=>args[1]==='up')).toEqual(['docker',['compose','up','-d','--no-deps','--no-recreate','--pull','never','redis'],5000]);
  expect(dependencies.probe.mock.calls).toEqual([['postgres'],['redis']]);
 });
 it('does not restart running services and names the unavailable dependency',async()=>{
  const dependencies=fixture();dependencies.probe.mockImplementation(service=>service==='redis'?Promise.reject(new GatePrerequisiteError('Redis is not running')):Promise.resolve());
  await expect(gatePreflight(dependencies)).rejects.toThrow('Redis is not running');
  expect(dependencies.run.mock.calls.some(([,args])=>args[1]==='up')).toBe(false);
 });
 it('reports both failed dependencies after failed startup without raw diagnostics',async()=>{
  const dependencies=fixture(),base=dependencies.run.getMockImplementation();
  dependencies.run.mockImplementation((command,args,...rest)=>args[0]==='compose'?(args[1]==='ps'?Promise.resolve(''):Promise.reject(new Error('private startup'))):base(command,args,...rest));
  dependencies.probe.mockRejectedValue(new Error('private diagnostic'));
  const error=await gatePreflight(dependencies).catch(value=>value);
  expect(error.message).toContain('PostgreSQL is not running');expect(error.message).toContain('Redis is not running');
  expect(error.message).not.toContain('private');expect(error.message).not.toContain('\n');
 });
 it('allows a bounded cold inspection longer than two seconds',async()=>{
  const dependencies=fixture(),base=dependencies.run.getMockImplementation();
  dependencies.run.mockImplementation((command,args,timeout)=>args[1]==='ps'?runPreflightCommand(process.execPath,['-e','setTimeout(()=>process.stdout.write("postgres\\nredis\\n"),2200)'],timeout):base(command,args,timeout));
  await expect(gatePreflight(dependencies)).resolves.toMatchObject({started:[]});
  expect(dependencies.run.mock.calls.find(([,args])=>args[1]==='ps')[2]).toBe(5000);
 });
 it('names both dependencies when Compose inspection fails and never starts tiers',async()=>{
  const dependencies=fixture(),base=dependencies.run.getMockImplementation();
  dependencies.run.mockImplementation((command,args,...rest)=>args[1]==='ps'?Promise.reject(new Error('private Docker diagnostic')):base(command,args,...rest));
  await expect(gatePreflight(dependencies)).rejects.toThrow('Test PostgreSQL and Redis: Docker Compose service inspection failed or exceeded 5 seconds');
  expect(dependencies.probe).not.toHaveBeenCalled();
 });
 it('reports Docker memory before image or service work, and refuses an unavailable daemon',async()=>{
  for(const output of [String(4*1024**3),null]){
   const dependencies=fixture();dependencies.run.mockImplementation(()=>output===null?Promise.reject(new Error('private')):Promise.resolve(output));
   await expect(gatePreflight(dependencies)).rejects.toThrow(output===null?'Docker is not running':'Docker has 4.00 GiB, needs at least 7');
   expect(dependencies.run).toHaveBeenCalledTimes(1);expect(dependencies.probe).not.toHaveBeenCalled();
  }
 });
 it('pulls a missing exact reference and inspects it again',async()=>{
  const image=(await images()).spicedb;
  const run=vi.fn().mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce('pulled').mockResolvedValueOnce('sha256:resolved\n');
  expect(await ensureGateImage(image,run)).toBe('sha256:resolved');
  expect(run.mock.calls).toEqual([['docker',['image','inspect',image,'--format','{{.Id}}'],5000],['docker',['pull',image],120000],['docker',['image','inspect',image,'--format','{{.Id}}'],5000]]);
 });
 it('reports the exact missing image when its pull fails, before services start',async()=>{
  const dependencies=fixture(),base=dependencies.run.getMockImplementation();
  dependencies.run.mockImplementation((command,args,...rest)=>['image','pull'].includes(args[0])?Promise.reject(new Error('private')):base(command,args,...rest));
  const error=await gatePreflight(dependencies).catch(value=>value);
  for(const image of Object.values(await images()))expect(error.message).toContain(`Image ${image} missing and could not be pulled`);
  expect(error.message).not.toContain('private');expect(dependencies.probe).not.toHaveBeenCalled();
 });
 it('requires repository digest pins and the locked Playwright version',async()=>{
  const pinned=await pinnedGateImages();
  for(const service of ['postgres','redis','spicedb'])expect(pinned[service]).toMatch(/@sha256:[a-f0-9]{64}$/u);
  expect(pinned.spicedb).not.toBe('authzed/spicedb:latest');expect(pinned.browser).toMatch(/^mcr.microsoft.com\/playwright:v\d+\.\d+\.\d+-noble$/u);
  const read=vi.fn().mockResolvedValueOnce(JSON.stringify({services:{postgres:{image:'postgres:latest'}}})).mockResolvedValueOnce('{}');
  await expect(pinnedGateImages(read)).rejects.toThrow('must have a pinned digest');
 });
 it('preserves safe concrete bootstrap causes on one line without native exception text',()=>{
  expect(bootstrapFailure(new GatePrerequisiteError('PostgreSQL is not running'),'services')).toBe('PostgreSQL is not running');
  expect(bootstrapFailure(Object.assign(new Error('password=private'),{code:'ENOENT'}),'fixture')).toBe('Normal-test bootstrap failed at fixture: required file or executable missing');
  expect(bootstrapFailure(new Error('private'),'fixture')).not.toContain('private');
 });
 it('kills a command that never finishes instead of hanging the gate',async()=>{
  const started=Date.now();
  await expect(runPreflightCommand(process.execPath,['-e','setInterval(()=>{},1000)'],150)).rejects.toMatchObject({killed:true,signal:'SIGKILL'});
  expect(Date.now()-started).toBeLessThan(2000);
 });
});

 describe('available RAM measurement',()=>{
  const mac=pageSize=>`Mach Virtual Memory Statistics: (page size of ${pageSize} bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 300.\nPages wired down: 999999.\n`;
  it('sums only free, inactive and speculative pages using the reported page size',()=>{
   for(const size of [4096,16384])expect(parseAvailableMemory('darwin',mac(size))).toBe(600*size);
  });
  it('uses Linux MemAvailable rather than MemFree or total RAM',()=>{
   expect(parseAvailableMemory('linux','MemTotal: 8000000 kB\nMemFree: 100 kB\nMemAvailable: 3000000 kB\n')).toBe(3000000*1024);
  });
  it('rejects incomplete, invalid and unsupported memory reports',()=>{
   for(const [platform,output] of [['darwin',mac(0)],['darwin',mac(4096).replace('Pages speculative: 300.','')],['linux','MemFree: 100 kB'],['linux','MemAvailable: -1 kB'],['win32','']])expect(()=>parseAvailableMemory(platform,output)).toThrow('cannot determine available RAM');
  });
  it('selects bounded vm_stat on macOS and proc meminfo on Linux',async()=>{
   const run=vi.fn().mockResolvedValue(mac(4096)),read=vi.fn().mockResolvedValue('MemAvailable: 3000000 kB\n');
   expect(await availableMemory({platform:'darwin',run,read})).toBe(600*4096);
   expect(run).toHaveBeenCalledWith('/usr/bin/vm_stat',[],5000);expect(read).not.toHaveBeenCalled();
   expect(await availableMemory({platform:'linux',run,read})).toBe(3000000*1024);
   expect(read).toHaveBeenCalledWith('/proc/meminfo','utf8');expect(run).toHaveBeenCalledTimes(1);
  });
 });
