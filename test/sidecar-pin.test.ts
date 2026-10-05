import {execFile} from 'node:child_process';
import {createHash,X509Certificate} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {prepareSidecarDevelopment} from '../scripts/sidecar-dev.js';
const run=promisify(execFile);
let directory:string;
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'engine-pin-'));await prepareSidecarDevelopment(directory);},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
it('offers pin help without requiring configuration or stopping the Engine',async()=>{
 const {stdout}=await run(process.execPath,['--import','tsx','sidecar/pin-command.ts','--help'],{env:{...process.env,SIDECAR_CONFIG_FILE:join(directory,'missing.json')}});
 expect(stdout).toContain('npm run sidecar:pin -- [CONFIG]');expect(stdout).toContain('no stop or state lock');
});
it('prints the full server-certificate hash with no private key or other TLS files, via argument or configured default',async()=>{
 const certificate=new X509Certificate(await readFile(join(directory,'tls/server.pem'),'utf8'));
 const expected=createHash('sha256').update(certificate.raw).digest('hex').toUpperCase()+'\n';
 for(const file of ['server.key','client.key','ca.key','ca.pem','client.pem'])await rm(join(directory,'tls',file));
 const config=join(directory,'service.json');
 const explicit=await run(process.execPath,['--import','tsx','sidecar/pin-command.ts',config]);
 expect(explicit.stdout).toBe(expected);expect(explicit.stderr).toBe('');
 const configured=await run(process.execPath,['--import','tsx','sidecar/pin-command.ts'],{env:{...process.env,SIDECAR_CONFIG_FILE:config}});
 expect(configured.stdout).toBe(expected);expect(configured.stderr).toBe('');
});
