import {it,expect,vi,afterEach} from 'vitest';
import {gateContainerLabels,cleanupGateContainers} from '../scripts/gate-containers.mjs';
const owner='01234567-89ab-4cde-8fab-0123456789ab';
afterEach(()=>vi.unstubAllEnvs());
it('labels only explicitly owned gate fixtures; standalone helpers have no ownership label',()=>{
 vi.stubEnv('OPINTEL_GATE_RUN_ID',undefined);expect(gateContainerLabels()).toEqual([]);
 vi.stubEnv('OPINTEL_GATE_RUN_ID',owner);expect(gateContainerLabels()).toEqual(['--label','io.opintel.gate-run='+owner]);
});
it('an interrupted child leaves resources for parent cleanup without exposing unlabelled installations',async()=>{
 const ours=['a'.repeat(12),'b'.repeat(64)],unrelated='c'.repeat(12),removed=[];
 const execute=async args=>{
  if(args[0]==='ps')return (args.includes('label=io.opintel.gate-run='+owner)?ours:[...ours,unrelated]).join('\n');
  if(args[0]==='rm'){removed.push(...args.slice(2));return '';}
  throw new Error('Unexpected Docker operation');
 };
 expect(await cleanupGateContainers(owner,execute)).toEqual({removed:2});expect(removed).toEqual(ours);expect(removed).not.toContain(unrelated);
});
it('an empty owned inventory never invokes remove',async()=>{
 const execute=vi.fn().mockResolvedValue('');expect(await cleanupGateContainers(owner,execute)).toEqual({removed:0});expect(execute).toHaveBeenCalledTimes(1);
});
it('an invalid inventory or ownership token fails before any removal',async()=>{
 const malformed=vi.fn().mockResolvedValue('unexpected-name-or-private-output');
 await expect(cleanupGateContainers(owner,malformed)).rejects.toThrow('no containers removed');expect(malformed).toHaveBeenCalledTimes(1);
 const execute=vi.fn();await expect(cleanupGateContainers('not-a-run',execute)).rejects.toThrow('ownership id');expect(execute).not.toHaveBeenCalled();
});
it('cleanup failure remains a failure rather than a green cleanup record',async()=>{
 await expect(cleanupGateContainers(owner,async()=>{throw new Error('Docker unavailable');})).rejects.toThrow('Docker unavailable');
});
