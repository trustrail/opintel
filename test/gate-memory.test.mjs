import {describe,it,expect,vi} from 'vitest';
import {setTimeout as delay} from 'node:timers/promises';
import {gateMemoryMonitor} from '../scripts/gate-memory.mjs';

describe('gate memory observations',()=>{
 it('retains the start and sampled minimum through recovery, recording failed readings',async()=>{
  const read=vi.fn().mockResolvedValue(2000).mockResolvedValueOnce(3000).mockResolvedValueOnce(1000).mockRejectedValueOnce(new Error('probe failed'));
  const monitor=gateMemoryMonitor({read,intervalMs:10});
  try{
   await monitor.start();
   await vi.waitFor(()=>expect(monitor.snapshot().failedSamples).toBe(1),{interval:5,timeout:1000});
  }finally{await monitor.stop();}
  expect(monitor.snapshot()).toMatchObject({startAvailableBytes:3000,minimumAvailableBytes:1000,failedSamples:1,intervalMs:10});
  expect(monitor.snapshot().samples).toBeGreaterThanOrEqual(3);
  const calls=read.mock.calls.length;
  await delay(30);expect(read).toHaveBeenCalledTimes(calls);
 });
 it('does not invent a start reading when the initial probe fails',async()=>{
  const monitor=gateMemoryMonitor({read:async()=>{throw new Error('probe failed');}});
  await expect(monitor.start()).rejects.toThrow('probe failed');await monitor.stop();
  expect(monitor.snapshot()).toMatchObject({startAvailableBytes:null,minimumAvailableBytes:null,samples:0,failedSamples:1});
 });
});
