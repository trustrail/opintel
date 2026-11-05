import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
// Keep the standard conformance command, assertions and 120-second startup
// deadline. Only expose startup stdout/stderr; restore the config byte-for-byte.
const path='playwright.conformance.config.ts',original=readFileSync(path,'utf8');
try{
 const diagnostic=original.replace('defineConfig({...base,','defineConfig({...base,webServer:{...base.webServer,stdout:\'pipe\',stderr:\'pipe\'},');
 if(diagnostic===original)throw new Error('Conformance config did not match startup log override.');
 writeFileSync(path,diagnostic);
 const result=spawnSync('npm',['run','test:conformance'],{stdio:'inherit',env:process.env});
 process.exitCode=result.status??1;
}finally{writeFileSync(path,original);}
