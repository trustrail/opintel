import {afterEach,it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runSoak} from '../scripts/operator/run-soak.js';
const directories:string[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
it.each([false,true])('DEP-017: packaged workflow orders seed/renew/prepare/soak and retains failure=%s',async fail=>{
 const directory=await mkdtemp(join(tmpdir(),'packaged-workflow-'));directories.push(directory);const script=join(directory,'demo.cjs');
 await writeFile(script,`const f=require('node:fs'),p=require('node:path');const step=process.argv[2];f.appendFileSync(process.env.OPINTEL_OUTPUT_DIRECTORY+'/steps',step+'\\n');if(step==='prepare'&&${fail})process.exit(1);if(step==='soak'){f.mkdirSync(process.env.OPINTEL_SOAK_OUTPUT_DIRECTORY,{recursive:true});f.writeFileSync(p.join(process.env.OPINTEL_SOAK_OUTPUT_DIRECTORY,'run.jsonl'),JSON.stringify({type:'summary',status:'PASSED'})+'\\n');}`);
 vi.stubEnv('OPINTEL_OUTPUT_DIRECTORY',directory);const old=process.argv[1];process.argv[1]=script;
 try{if(fail)await expect(runSoak('1800')).rejects.toThrow('Packaged soak failed');else await runSoak('1800');}finally{process.argv[1]=old;}
 expect((await readFile(join(directory,'steps'),'utf8')).trim().split('\n')).toEqual(fail?['seed','lifecycle-renew','prepare']:['seed','lifecycle-renew','prepare','soak']);
 const run=(await readdir(directory)).find(n=>n.startsWith('soak-run-'))!;expect(JSON.parse(await readFile(join(directory,run,'result.json'),'utf8'))).toMatchObject({status:fail?'failed':'passed',durationSeconds:1800});
});
