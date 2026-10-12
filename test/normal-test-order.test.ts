import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import type {TestSpecification,Vitest} from 'vitest/node';
import NormalSequencer from '../scripts/testing/normal-sequencer.js';
import {repositoryRoot} from '../scripts/dev-environment.js';

it('normal test order ignores cache failures/durations and records the selected file list',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'normal-order-'));const previous=process.env.OPINTEL_NORMAL_RUN_METADATA;
 process.env.OPINTEL_NORMAL_RUN_METADATA=directory;
 try{
  const sequencer=new NormalSequencer({get cache(){throw new Error('Cache must never affect normal ordering.');}} as unknown as Vitest);
  const file=(name:string)=>({moduleId:join(repositoryRoot,'test',name),project:{name:''}} as TestSpecification);
  const a=file('a.test.ts'),z=file('z.test.ts'),middle=file('middle.test.ts');
  expect(await sequencer.sort([z,a,middle])).toEqual([a,middle,z]);
  expect(await sequencer.sort([middle,z,a])).toEqual([a,middle,z]);
  expect(JSON.parse(await readFile(join(directory,'order.json'),'utf8'))).toMatchObject({shuffle:false,cacheOrdering:false,files:[{project:'',path:'test/a.test.ts'},{project:'',path:'test/middle.test.ts'},{project:'',path:'test/z.test.ts'}]});
 }finally{if(previous===undefined)delete process.env.OPINTEL_NORMAL_RUN_METADATA;else process.env.OPINTEL_NORMAL_RUN_METADATA=previous;await rm(directory,{recursive:true,force:true});}
});
