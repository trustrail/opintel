import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const checker=fileURLToPath(new URL('../scripts/check-production-artifact.mjs',import.meta.url));
it('production artifacts reject either review route and accept an artifact with neither',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'opintel-artifact-'));
 try{
  await mkdir(join(directory,'dist'));
  for(const text of ['/dev/kitchen-sink','/dev/shared-patterns','/projects']){
   await writeFile(join(directory,'dist','app.js'),JSON.stringify(text));
   const result=spawnSync(process.execPath,[checker],{cwd:directory,encoding:'utf8'});
   expect(result.status).toBe(text==='/projects'?0:1);
   if(text!=='/projects')expect(result.stderr).toContain('Production artifact contains forbidden review route '+text);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
