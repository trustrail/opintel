import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {captureProcessLog} from './acceptance-log.mjs';
const directory=resolve(process.argv[2]);process.umask(0o077);const retained=[];
for(const [kind,service] of [['gateway','api'],['gateway','ingress'],['engine','engine']]){
 const project=readFileSync(join(directory,kind,'state/project-name'),'utf8').trim();
 const result=spawnSync('docker',['ps','--all','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service='+service,'--format','{{.ID}}'],{encoding:'utf8',timeout:30000});
 if(result.error||result.status!==0)throw new Error('Cannot identify '+kind+' '+service+' log container');
 const ids=result.stdout.trim().split(/\s+/u).filter(Boolean);if(!ids.length)throw new Error('No retained '+kind+' '+service+' container');
 for(const id of ids){const file=join(directory,`verify-${kind}-${service}-${id}.log`);captureProcessLog('docker',['logs','--timestamps',id],file);retained.push({kind,service,file});}
}
writeFileSync(join(directory,'verify-log-capture.json'),JSON.stringify(retained,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(retained));
