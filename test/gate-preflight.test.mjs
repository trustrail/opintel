import process from 'node:process';
import {describe,it,expect,vi} from 'vitest';
import {gatePreflight,runPreflightCommand,parseAvailableMemory,availableMemory} from '../scripts/gate-preflight.mjs';

const memory=()=>1024**3;

describe('gate service preflight',()=>{
 it('refuses below 1 GiB before inspecting or starting services',async()=>{
  const run=vi.fn(),probe=vi.fn();
  await expect(gatePreflight({run,probe,memory:()=>1024**3-1})).rejects.toThrow('at least 1 GiB required');
  expect(run).not.toHaveBeenCalled();expect(probe).not.toHaveBeenCalled();
 });
 it('accepts exactly 1 GiB and records the measured available memory',async()=>{
  const run=vi.fn().mockResolvedValue('postgres\nredis\n'),probe=vi.fn().mockResolvedValue(undefined);
  await expect(gatePreflight({run,probe,memory})).resolves.toMatchObject({memory:{availableBytes:1024**3,minimumAvailableBytes:1024**3}});
 });
 it('fails closed when the available-memory reading is invalid',async()=>{
  const run=vi.fn(),probe=vi.fn();
  await expect(gatePreflight({run,probe,memory:()=>NaN})).rejects.toThrow('cannot determine available RAM');
  expect(run).not.toHaveBeenCalled();expect(probe).not.toHaveBeenCalled();
 });
 it('starts stopped Compose services and probes both dependencies',async()=>{
  const run=vi.fn().mockResolvedValueOnce('postgres\n').mockResolvedValueOnce('');
  const probe=vi.fn().mockResolvedValue(undefined);
  await expect(gatePreflight({run,probe,memory})).resolves.toMatchObject({started:['redis'],postgres:'reachable',redis:'reachable'});
  expect(run.mock.calls[1]).toEqual(['docker',['compose','up','-d','--no-deps','--no-recreate','--pull','never','redis'],5000]);
  expect(probe.mock.calls).toEqual([['postgres'],['redis']]);
 });
 it('does not restart running services and names the unavailable dependency',async()=>{
  const run=vi.fn().mockResolvedValue('postgres\nredis\n');
  const probe=vi.fn(service=>service==='redis'?Promise.reject(new Error('private diagnostic')):Promise.resolve());
  await expect(gatePreflight({run,probe,memory})).rejects.toThrow('Redis did not become reachable within 5 seconds');
  expect(run).toHaveBeenCalledTimes(1);
 });
 it('reports both failed dependencies after a failed startup, without raw diagnostics',async()=>{
  const run=vi.fn().mockResolvedValueOnce('').mockRejectedValueOnce(new Error('private diagnostic'));
  const probe=vi.fn().mockRejectedValue(new Error('private diagnostic'));
  const error=await gatePreflight({run,probe,memory}).catch(value=>value);
  expect(error.message).toContain('Test PostgreSQL did not become reachable');
  expect(error.message).toContain('Redis did not become reachable');
  expect(error.message).not.toContain('private diagnostic');
 });
 it('allows a bounded cold inspection longer than two seconds',async()=>{
  const run=vi.fn((_command,_args,timeout)=>runPreflightCommand(process.execPath,['-e','setTimeout(()=>process.stdout.write("postgres\\nredis\\n"),2200)'],timeout));
  const probe=vi.fn().mockResolvedValue(undefined);
  await expect(gatePreflight({run,probe,memory})).resolves.toMatchObject({started:[]});
  expect(run.mock.calls[0][2]).toBe(5000);
  expect(run).toHaveBeenCalledTimes(1);
 });
 it('names both dependencies when Compose inspection fails and never starts tiers',async()=>{
  const run=vi.fn().mockRejectedValue(new Error('private Docker diagnostic'));
  const probe=vi.fn();
  await expect(gatePreflight({run,probe,memory})).rejects.toThrow('Test PostgreSQL and Redis: Docker Compose service inspection failed or exceeded 5 seconds');
  expect(probe).not.toHaveBeenCalled();
  expect(run).toHaveBeenCalledTimes(1);
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
