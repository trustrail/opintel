import process from 'node:process';
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import {recordStats,startRunCapture} from '../scripts/run-capture.mjs';
it('keeps every container and every timestamped Docker sample in a private full series',()=>{
 const directory=mkdtempSync(join(tmpdir(),'run-capture-')),file=join(directory,'stats.jsonl');
 try{
  const first=[{ID:'one',CPUPerc:'10%',MemUsage:'1MiB / 1GiB'},{ID:'two',CPUPerc:'0%',MemUsage:'0B / 0B'}];
  expect(recordStats(file,first.map(x=>JSON.stringify(x)).join('\n'),'start-1','end-1')).toBe(2);
  recordStats(file,JSON.stringify({ID:'three',CPUPerc:'90%'}),'start-2','end-2');
  const samples=readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  expect(samples).toEqual([{startedAt:'start-1',finishedAt:'end-1',containers:first},{startedAt:'start-2',finishedAt:'end-2',containers:[{ID:'three',CPUPerc:'90%'}]}]);
  expect(statSync(file).mode&0o777).toBe(0o600);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

it('samples independently while the parent is blocked and shuts down its log followers',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'run-capture-worker-'));
 try{
  const capture=await startRunCapture(directory);
  try{const {spawnSync}=await import('node:child_process');spawnSync(process.execPath,['-e','Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,6500)']);}
  finally{await capture.stop();}
  const result=JSON.parse(readFileSync(join(directory,'capture.json'),'utf8'));
  expect(result).toMatchObject({intervalMs:5000,failedSamples:0,complete:true});expect(result.samples).toBeGreaterThanOrEqual(3);
  expect(readFileSync(join(directory,'docker-stats.jsonl'),'utf8').trim().split('\n')).toHaveLength(result.samples);
 }finally{rmSync(directory,{recursive:true,force:true});}
},30000);
