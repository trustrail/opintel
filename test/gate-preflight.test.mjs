import process from 'node:process';
import {describe,it,expect,vi} from 'vitest';
import {gatePreflight,runPreflightCommand} from '../scripts/gate-preflight.mjs';

describe('gate service preflight',()=>{
 it('starts stopped Compose services and probes both dependencies',async()=>{
  const run=vi.fn().mockResolvedValueOnce('postgres\n').mockResolvedValueOnce('');
  const probe=vi.fn().mockResolvedValue(undefined);
  await expect(gatePreflight({run,probe})).resolves.toMatchObject({started:['redis'],postgres:'reachable',redis:'reachable'});
  expect(run.mock.calls[1]).toEqual(['docker',['compose','up','-d','--no-deps','--no-recreate','--pull','never','redis'],5000]);
  expect(probe.mock.calls).toEqual([['postgres'],['redis']]);
 });
 it('does not restart running services and names the unavailable dependency',async()=>{
  const run=vi.fn().mockResolvedValue('postgres\nredis\n');
  const probe=vi.fn(service=>service==='redis'?Promise.reject(new Error('private diagnostic')):Promise.resolve());
  await expect(gatePreflight({run,probe})).rejects.toThrow('Redis did not become reachable within 5 seconds');
  expect(run).toHaveBeenCalledTimes(1);
 });
 it('reports both failed dependencies after a failed startup, without raw diagnostics',async()=>{
  const run=vi.fn().mockResolvedValueOnce('').mockRejectedValueOnce(new Error('private diagnostic'));
  const probe=vi.fn().mockRejectedValue(new Error('private diagnostic'));
  const error=await gatePreflight({run,probe}).catch(value=>value);
  expect(error.message).toContain('Test PostgreSQL did not become reachable');
  expect(error.message).toContain('Redis did not become reachable');
  expect(error.message).not.toContain('private diagnostic');
 });
 it('kills a command that never finishes instead of hanging the gate',async()=>{
  const started=Date.now();
  await expect(runPreflightCommand(process.execPath,['-e','setInterval(()=>{},1000)'],150)).rejects.toMatchObject({killed:true,signal:'SIGKILL'});
  expect(Date.now()-started).toBeLessThan(2000);
 });
});
