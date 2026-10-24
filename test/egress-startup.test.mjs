import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
it('companion startup reports authored phases without exception text or configuration values',()=>{
 const directory=mkdtempSync(join(tmpdir(),'egress-phases-'));
 const secret='PRIVATE_ERROR_SENTINEL';
 try{
  const file=join(directory,'config.json');
  for(const [phase,config] of [['configuration',null],['tls',{postgresReadinessSource:'secret://test/readiness',receiptUrl:'https://gateway.example:3101',tls:{caFile:secret,certFile:secret,keyFile:secret,clientPinFile:secret}}]]){
   if(config)writeFileSync(file,JSON.stringify(config));
   const result=spawnSync(process.execPath,['--import','tsx','deploy/engine/egress.mjs'],{env:{...process.env,EGRESS_DYNAMIC_CONFIG:file},encoding:'utf8',timeout:15000});
   expect(result.status).toBe(1);
   expect(result.stderr).toContain("event: 'engine.egress_startup_failed'");
   expect(result.stderr).toContain(`phase: '${phase}'`);
   expect(result.stderr).not.toContain(secret);
   expect(result.stderr).not.toContain(file);
   expect(result.stderr).not.toContain('ENOENT');
   expect(result.stderr).not.toContain('Error:');
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});
